"""Phase 3: DSMC parameter manager + SPARTA input generation.
Configuration-only: nothing here executes SPARTA; generated scripts are never reported as run."""
import csv, io, json, re
from types import SimpleNamespace
import numpy as np
from fastapi import APIRouter, File, HTTPException, Response, UploadFile
from pydantic import BaseModel
from . import __version__, fmf
from .main import DATA, db, get_dataset, log
from .routes_phase2 import atmosphere_at, load_mesh, row as geo_row

router = APIRouter()
(DATA / "sparta").mkdir(exist_ok=True)

CAPS = {"solver": "SPARTA", "dimension": 3, "collision_models": ["vhs", "vss", "hs"], "surface_models": ["diffuse", "specular"],
        "boundaries": ["o", "s", "p"], "bundled_species": ["N2", "O2", "NO", "N", "O"],
        "diagnostics": ["surface_force", "surface_pressure", "density", "velocity", "temperature"],
        "note": "Conservative registry; versions are user-declared and not verified against a SPARTA build.",
        "not_exposed": {"species-pair collision overrides": "SPARTA VSS parameters are per species, not per pair",
                        "grid adaptation": "not supported by this generator yet", "particle tracking": "not supported yet"}}
VSS = {"O": (3.0e-10, 0.77, 1.0), "N": (3.0e-10, 0.75, 1.0), "N2": (4.17e-10, 0.74, 1.36), "O2": (4.07e-10, 0.77, 1.40),
       "He": (2.33e-10, 0.66, 1.26), "Ar": (4.17e-10, 0.81, 1.40), "H": (2.5e-10, 0.75, 1.0)}   # diam, omega, alpha (Bird 1994; O, N, H approximate)

def default_params(V, atm, T, speed, beta, phi, Tw, sigma):
    pts = V.reshape(-1, 3); L = float(np.ptp(pts, axis=0).max())
    h = round(1.5 * float(np.abs(pts).max()) + 0.25 * L, 3); n = 30; cell = 2 * h / n
    dt = float(f"{0.5 * cell / speed:.3g}"); cross = 2 * h / (speed * dt); tr = int(3 * cross)
    return {"gas": {"species": atm, "T_k": T, "speed_m_s": speed, "beta_deg": beta, "phi_deg": phi},
            "collision": {"model": "vhs", "species": {k: {"diam": VSS[k][0], "omega": VSS[k][1], "tref": 273.15, "alpha": VSS[k][2]} for k in atm}},
            "domain": {"lo": [-h] * 3, "hi": [h] * 3, "grid": [n] * 3, "boundary": "o o o"},
            "particles": {"mode": "ppc", "ppc": 10, "fnum": None, "initialize": True},
            "time": {"dt": dt, "transient_steps": tr, "steps": tr + 500, "sample_interval": 5, "avg_steps": 100, "output_every": 100},
            "surface": {"model": "diffuse", "t_wall_k": Tw, "accommodation": sigma},
            "numerics": {"seed": 12345, "gridcut": 0.0, "balance": "rcb", "mpi_procs": 1, "species_file": None},
            "diagnostics": {"surface_force": True, "surface_pressure": True, "density": False, "velocity": False, "temperature": False}}

def validate(p, bbox=None):
    E, W = [], []
    try:
        g, d, t, s, pa, c, nu, dg = (p[k] for k in ("gas", "domain", "time", "surface", "particles", "collision", "numerics", "diagnostics"))
        sp = g["species"]
        if not sp: E.append("gas: no species")
        for k, v in sp.items():
            if k not in VSS: E.append(f"gas: unsupported species '{k}'")
            elif not v > 0: E.append(f"gas: density of {k} must be > 0")
            elif k not in CAPS["bundled_species"] and not nu.get("species_file"): W.append(f"{k} is not in SPARTA's bundled air.species; set numerics.species_file")
            if k not in c["species"]: E.append(f"collision: no parameters for {k}")
        if not (g["T_k"] > 0 and g["speed_m_s"] > 0): E.append("gas: T and speed must be > 0")
        if c["model"] not in CAPS["collision_models"]: E.append(f"collision: model must be one of {CAPS['collision_models']}")
        if s["model"] not in CAPS["surface_models"]: E.append(f"surface: model must be one of {CAPS['surface_models']}")
        if not 0 <= s["accommodation"] <= 1: E.append("surface: accommodation must be in [0,1]")
        if not re.fullmatch(r"[osp] [osp] [osp]", d["boundary"]): E.append("domain: boundary must look like 'o o o' (o/s/p)")
        lo, hi, n = map(np.array, (d["lo"], d["hi"], d["grid"]))
        if not (hi > lo).all(): E.append("domain: hi must exceed lo on every axis")
        if not (n >= 1).all() or len(n) != 3: E.append("domain: grid must be 3 integers >= 1")
        if E: return E, W
        cell = (hi - lo) / n
        if bbox is not None and not ((np.array(bbox[0]) > lo).all() and (np.array(bbox[1]) < hi).all()): E.append("domain: geometry bounding box is not inside the domain")
        if bbox is None: W.append("no geometry associated: domain/geometry fit not checked")
        if pa["mode"] == "ppc" and not pa["ppc"] > 0 or pa["mode"] == "explicit" and not (pa["fnum"] or 0) > 0: E.append("particles: ppc/fnum must be > 0")
        if pa["mode"] not in ("ppc", "explicit"): E.append("particles: mode must be 'ppc' or 'explicit'")
        if not t["dt"] > 0: E.append("time: dt must be > 0")
        elif g["speed_m_s"] * t["dt"] > cell.min(): W.append("time: particles cross more than one cell per step; reduce dt")
        nev, nfreq = t["sample_interval"], t["output_every"]
        if not (nev >= 1 and nfreq >= 1 and t["avg_steps"] >= nev): E.append("time: sample_interval/output_every must be >= 1 and avg_steps >= sample_interval")
        elif (t["avg_steps"] // nev) * nev > nfreq or nfreq % nev: E.append("time: need floor(avg_steps/sample_interval)*sample_interval <= output_every, and output_every a multiple of sample_interval")
        if t["steps"] - t["transient_steps"] < nfreq: E.append("time: sampling phase (steps - transient_steps) shorter than output_every")
        lam = fmf.mean_free_path({k: v for k, v in sp.items() if k in fmf.DIAM})
        if cell.max() > lam / 3: W.append(f"grid: cell {cell.max():.3g} m > mean free path/3 ({lam / 3:.3g} m); collisions poorly resolved (acceptable if free-molecular)")
        if not dg["surface_force"]: W.append("diagnostics: surface_force off; no force output for FMF comparison")
    except (KeyError, TypeError, ValueError) as e:
        E.append(f"missing or malformed parameter: {e}")
    return E, W

def surf_text(V):
    pts, inv = np.unique(np.round(V.reshape(-1, 3), 12), axis=0, return_inverse=True)
    tri = inv.reshape(-1, 3)
    tri = tri[(tri[:, 0] != tri[:, 1]) & (tri[:, 1] != tri[:, 2]) & (tri[:, 0] != tri[:, 2])]
    return ("# AEROSIM surface (triangles keep outward-normal winding)\n" + f"{len(pts)} points\n{len(tri)} triangles\n\nPoints\n\n" +
            "".join(f"{i + 1} {x:.9g} {y:.9g} {z:.9g}\n" for i, (x, y, z) in enumerate(pts)) + "\nTriangles\n\n" +
            "".join(f"{i + 1} {a + 1} {b + 1} {c + 1}\n" for i, (a, b, c) in enumerate(tri)))

def vss_text(p):
    c = p["collision"]
    rows = []
    for k, v in c["species"].items():
        om, al = (0.5, 1.0) if c["model"] == "hs" else (v["omega"], 1.0 if c["model"] == "vhs" else v["alpha"])
        rows.append(f"{k} {v['diam']:.6g} {om:.6g} {v['tref']:.6g} {al:.6g}\n")
    return "# species diam omega tref alpha\n" + "".join(rows)

def script_text(p, cid, ver, solver_version):
    g, d, t, s, pa, nu, dg = (p[k] for k in ("gas", "domain", "time", "surface", "particles", "numerics", "diagnostics"))
    sp = list(g["species"]); ntot = sum(g["species"].values()); lo, hi, n = d["lo"], d["hi"], d["grid"]
    vol = float(np.prod((np.array(hi) - np.array(lo)) / np.array(n)))
    fnum = pa["fnum"] if pa["mode"] == "explicit" else ntot * vol / pa["ppc"]
    vs = fmf.flow_dir(g["beta_deg"], g.get("phi_deg", 0)) * g["speed_m_s"]
    faces = [f"{ax}{'lo' if vs[i] > 0 else 'hi'}" for i, ax in enumerate("xyz") if abs(vs[i]) > 1e-9]
    nev, nfreq = t["sample_interval"], t["output_every"]; nrep = max(1, t["avg_steps"] // nev)
    fv = (["fx", "fy", "fz"] if dg["surface_force"] else []) + (["press"] if dg["surface_pressure"] else [])
    gv = (["nrho"] if dg["density"] else []) + (["u", "v", "w"] if dg["velocity"] else []) + (["temp"] if dg["temperature"] else [])
    L = [f"# AEROSIM {__version__} - DSMC config {cid} v{ver}",
         f"# Generated input script. It has NOT been executed. Validate it with your SPARTA build ({solver_version or 'version not declared'}).",
         f"seed {nu['seed']}", "dimension 3", f"global gridcut {nu['gridcut']} comm/sort yes", f"boundary {d['boundary']}",
         "create_box " + " ".join(f"{a:.9g} {b:.9g}" for a, b in zip(lo, hi)), "create_grid " + " ".join(map(str, n)),
         f"balance_grid {nu['balance']} cell", f"global nrho {ntot:.9g} fnum {fnum:.9g}",
         f"species {nu.get('species_file') or 'air.species'} " + " ".join(sp),
         f"mixture air {' '.join(sp)} vstream {vs[0]:.9g} {vs[1]:.9g} {vs[2]:.9g} temp {g['T_k']:.9g}"]
    L += [f"mixture air {k} frac {v / ntot:.9g}" for k, v in g["species"].items()]
    L += ["collide vss air collide.vss", "read_surf geom.surf",
          "surf_collide 1 " + (f"diffuse {s['t_wall_k']:.9g} {s['accommodation']:.9g}" if s["model"] == "diffuse" else "specular"),
          "surf_modify all collide 1", f"fix in emit/face air {' '.join(faces)}"]
    if pa["initialize"]: L.append("create_particles air n 0 twopass")
    L += [f"timestep {t['dt']:.9g}", f"stats {nfreq}", "stats_style step cpu np nattempt ncoll nscoll nscheck", f"run {t['transient_steps']}"]
    if fv:
        L += [f"compute fs surf all all {' '.join(fv)}", f"fix fave ave/surf all {nev} {nrep} {nfreq} " + " ".join(f"c_fs[{i + 1}]" for i in range(len(fv))) + " ave one"]
        if dg["surface_force"]:
            L += ["compute ftot reduce sum f_fave[1] f_fave[2] f_fave[3]", "stats_style step cpu np nattempt ncoll nscoll nscheck c_ftot[1] c_ftot[2] c_ftot[3]"]
        L.append(f"dump sdump surf all {nfreq} out/surf.*.dat id " + " ".join(f"f_fave[{i + 1}]" for i in range(len(fv))))
    if gv:
        L += [f"compute gf grid all all {' '.join(gv)}", f"fix gave ave/grid all {nev} {nrep} {nfreq} " + " ".join(f"c_gf[{i + 1}]" for i in range(len(gv))) + " ave one",
              f"dump gdump grid all {nfreq} out/grid.*.dat id xc yc zc " + " ".join(f"f_gave[{i + 1}]" for i in range(len(gv)))]
    L.append(f"run {t['steps'] - t['transient_steps']}")
    return "\n".join(L) + "\n"

# ---------------- API ----------------
@router.get("/api/version")
def version():
    return {"version": __version__, "mode": "configuration-only", "solver_execution": False}

@router.get("/api/dsmc/capabilities")
def caps():
    return CAPS

class DefaultsIn(BaseModel):
    geometry_id: int
    dataset_id: int | None = None
    altitude_km: float = 400.0
    manual_atmosphere: dict | None = None
    beta_deg: float = 0.0
    phi_deg: float = 0.0
    velocity_m_s: float | None = None
    t_wall_k: float = 300.0
    sigma: float = 1.0

@router.post("/api/dsmc/defaults")
def defaults(r: DefaultsIn):
    with db() as c:
        V, _ = load_mesh(c, json.loads(geo_row(c, r.geometry_id)["params_json"]))
    ds = get_dataset(r.dataset_id) if r.dataset_id and not r.manual_atmosphere else None
    w = []; T, atm = atmosphere_at(SimpleNamespace(manual_atmosphere=r.manual_atmosphere), r.altitude_km, ds, w)
    atm = {k: v for k, v in atm.items() if k in VSS}
    p = default_params(V, atm, T, r.velocity_m_s or fmf.orbital_speed(r.altitude_km * 1e3), r.beta_deg, r.phi_deg, r.t_wall_k, r.sigma)
    return {"params": p, "warnings": w}

class CfgIn(BaseModel):
    name: str
    params: dict
    solver_version: str | None = None
    dataset_id: int | None = None
    spacecraft_id: int | None = None
    project_id: int | None = None

def _bbox(c, sid):
    if not sid: return None
    V, _ = load_mesh(c, json.loads(geo_row(c, sid)["params_json"])); pts = V.reshape(-1, 3)
    return pts.min(0).tolist(), pts.max(0).tolist()

def cfg_row(c, cid):
    r = c.execute("SELECT * FROM dsmc_configurations WHERE id=?", (cid,)).fetchone()
    if not r: raise HTTPException(404, "DSMC configuration not found")
    return r

@router.post("/api/dsmc/configurations")
def create_cfg(b: CfgIn):
    with db() as c:
        E, W = validate(b.params, _bbox(c, b.spacecraft_id))
        cid = c.execute("INSERT INTO dsmc_configurations(project_id,name,params_json,solver_version,dataset_id,spacecraft_id) VALUES(?,?,?,?,?,?)",
                        (b.project_id, b.name, json.dumps(b.params), b.solver_version, b.dataset_id, b.spacecraft_id)).lastrowid
        c.execute("INSERT INTO dsmc_versions(dsmc_id,version,snapshot_json) VALUES(?,1,?)", (cid, json.dumps(b.params)))
        log(c, "dsmc", f"Saved DSMC configuration '{b.name}'")
    return {"id": cid, "validation": {"errors": E, "warnings": W}}

@router.get("/api/dsmc/configurations")
def list_cfg():
    with db() as c:
        return [dict(r) for r in c.execute("SELECT id,name,solver,solver_version,dataset_id,spacecraft_id,version,created_at FROM dsmc_configurations ORDER BY id DESC")]

@router.get("/api/dsmc/configurations/{cid}")
def get_cfg(cid: int):
    with db() as c:
        r = cfg_row(c, cid); p = json.loads(r["params_json"]); E, W = validate(p, _bbox(c, r["spacecraft_id"]))
    return {**{k: r[k] for k in ("id", "name", "solver", "solver_version", "dataset_id", "spacecraft_id", "version")}, "params": p, "validation": {"errors": E, "warnings": W}}

@router.put("/api/dsmc/configurations/{cid}")
def update_cfg(cid: int, b: CfgIn):
    with db() as c:
        v = cfg_row(c, cid)["version"] + 1
        c.execute("UPDATE dsmc_configurations SET name=?,params_json=?,solver_version=?,dataset_id=?,spacecraft_id=?,version=? WHERE id=?",
                  (b.name, json.dumps(b.params), b.solver_version, b.dataset_id, b.spacecraft_id, v, cid))
        c.execute("INSERT INTO dsmc_versions(dsmc_id,version,snapshot_json) VALUES(?,?,?)", (cid, v, json.dumps(b.params)))
        E, W = validate(b.params, _bbox(c, b.spacecraft_id))
    return {"id": cid, "version": v, "validation": {"errors": E, "warnings": W}}

@router.post("/api/dsmc/configurations/{cid}/duplicate")
def dup_cfg(cid: int):
    with db() as c:
        r = cfg_row(c, cid)
    return create_cfg(CfgIn(name=r["name"] + " (copy)", params=json.loads(r["params_json"]), solver_version=r["solver_version"],
                            dataset_id=r["dataset_id"], spacecraft_id=r["spacecraft_id"], project_id=r["project_id"]))

def flat(d, pre=""):
    out = {}
    for k, v in d.items():
        out.update(flat(v, f"{pre}{k}.") if isinstance(v, dict) else {f"{pre}{k}": v})
    return out

@router.get("/api/dsmc/compare")
def compare(a: int, b: int):
    with db() as c:
        ra, rb = cfg_row(c, a), cfg_row(c, b)
    fa, fb = flat(json.loads(ra["params_json"])), flat(json.loads(rb["params_json"]))
    for r, f in ((ra, fa), (rb, fb)): f.update({"@dataset_id": r["dataset_id"], "@spacecraft_id": r["spacecraft_id"], "@solver_version": r["solver_version"]})
    diffs = [{"key": k, "a": fa.get(k), "b": fb.get(k)} for k in sorted(set(fa) | set(fb)) if fa.get(k) != fb.get(k)]
    return {"a": a, "b": b, "n_differences": len(diffs), "differences": diffs}

@router.get("/api/dsmc/configurations/{cid}/export.json")
def export_json(cid: int):
    return get_cfg(cid)

@router.get("/api/dsmc/configurations/{cid}/export.csv")
def export_csv(cid: int):
    with db() as c:
        r = cfg_row(c, cid)
    buf = io.StringIO(); w = csv.writer(buf); w.writerow(["key", "value"])
    for k, v in flat(json.loads(r["params_json"])).items(): w.writerow([k, json.dumps(v) if isinstance(v, (list, dict)) else v])
    return Response(buf.getvalue(), media_type="text/csv")

@router.post("/api/dsmc/configurations/{cid}/generate")
def generate(cid: int):
    with db() as c:
        r = cfg_row(c, cid); p = json.loads(r["params_json"])
        if not r["spacecraft_id"]: raise HTTPException(422, "Associate a spacecraft geometry before generating a SPARTA script")
        E, W = validate(p, _bbox(c, r["spacecraft_id"]))
        if E: raise HTTPException(422, {"errors": E, "warnings": W})
        V, sheet = load_mesh(c, json.loads(geo_row(c, r["spacecraft_id"])["params_json"]))
        if sheet.any(): W.append("geometry contains a zero-thickness membrane (open surface); check SPARTA surface/cell handling for open surfaces before relying on results")
        out = DATA / "sparta" / f"cfg{cid}_v{r['version']}"; out.mkdir(parents=True, exist_ok=True)
        script = script_text(p, cid, r["version"], r["solver_version"])
        (out / "in.sparta").write_text(script); (out / "geom.surf").write_text(surf_text(V)); (out / "collide.vss").write_text(vss_text(p))
        meta = {"origin": "generated", "executed": False, "aerosim_version": __version__, "solver_version": r["solver_version"],
                "files": ["in.sparta", "geom.surf", "collide.vss"], "warnings": W}
        jid = c.execute("INSERT INTO dsmc_jobs(dsmc_id,status,input_path,meta_json) VALUES(?,?,?,?)", (cid, "ready", str(out / "in.sparta"), json.dumps(meta))).lastrowid
        log(c, "dsmc", f"Generated SPARTA input for configuration {cid} (not executed)")
    return {"job_id": jid, "status": "ready", "executed": False, "directory": str(out), "warnings": W, "script": script}

@router.post("/api/dsmc/configurations/{cid}/scripts")
async def upload_script(cid: int, file: UploadFile = File(...)):
    raw = await file.read()
    with db() as c:
        cfg_row(c, cid)
        out = DATA / "sparta" / f"cfg{cid}_uploaded"; out.mkdir(parents=True, exist_ok=True)
        path = out / re.sub(r"[^\w.\-]", "_", file.filename or "in.sparta"); path.write_bytes(raw)
        meta = {"origin": "uploaded", "executed": False, "filename": file.filename, "bytes": len(raw)}
        jid = c.execute("INSERT INTO dsmc_jobs(dsmc_id,status,input_path,meta_json) VALUES(?,?,?,?)", (cid, "draft", str(path), json.dumps(meta))).lastrowid
    return {"job_id": jid, "status": "draft", **meta}

@router.get("/api/dsmc/jobs")
def jobs():
    with db() as c:
        return [{**dict(r), "meta": json.loads(r["meta_json"] or "{}")} for r in c.execute("SELECT id,dsmc_id,status,input_path,meta_json FROM dsmc_jobs ORDER BY id DESC")]
