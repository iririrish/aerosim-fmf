"""Phase 2 routes: spacecraft geometry + FMF calculator."""
import hashlib, json, re
from datetime import datetime, timezone
from typing import Literal
import numpy as np
from fastapi import APIRouter, File, Form, HTTPException, Response, UploadFile
from pydantic import BaseModel
from .main import DATA, db, get_dataset, log
from . import fmf, geometry as geo

router = APIRouter()
(DATA / "geometry").mkdir(exist_ok=True)

def check(p):
    try:
        b = p["body"]; assert all(b[k] > 0 for k in "xyz") and p.get("mass_kg", 1) > 0
        sl = p.get("sail", {})
        if sl.get("enabled"): assert 5 <= sl["half_angle_deg"] <= 85 and sl["base_diameter_m"] > 0
        assert 3 <= p.get("surface", {}).get("t_wall_k", 300) <= 2000
    except (KeyError, AssertionError, TypeError):
        raise HTTPException(422, "Invalid geometry: need body x/y/z > 0, mass > 0, sail half_angle_deg 5-85, base_diameter_m > 0, t_wall_k 3-2000")

def load_mesh(c, p):
    raw = None
    if p.get("stl_file_id"):
        r = c.execute("SELECT stored_path FROM geometry_files WHERE id=?", (p["stl_file_id"],)).fetchone()
        raw = open(r["stored_path"], "rb").read()
    return geo.build_mesh(p, raw)

def row(c, gid):
    r = c.execute("SELECT * FROM spacecraft_configurations WHERE id=?", (gid,)).fetchone()
    if not r: raise HTTPException(404, "Geometry not found")
    return r

class GeoIn(BaseModel):
    name: str
    params: dict
    project_id: int | None = None

def _insert(c, name, params, pid):
    check(params)
    gid = c.execute("INSERT INTO spacecraft_configurations(project_id,name,params_json) VALUES(?,?,?)", (pid, name, json.dumps(params))).lastrowid
    c.execute("INSERT INTO geometry_versions(config_id,version,snapshot_json) VALUES(?,1,?)", (gid, json.dumps(params)))
    log(c, "geometry", f"Saved spacecraft geometry '{name}'")
    return gid

@router.post("/api/geometry")
def create_geo(g: GeoIn):
    with db() as c:
        return {"id": _insert(c, g.name, g.params, g.project_id)}

@router.get("/api/geometry")
def list_geo():
    with db() as c:
        return [dict(r) for r in c.execute("SELECT id,name,version,created_at FROM spacecraft_configurations ORDER BY id DESC")]

@router.get("/api/geometry/{gid}")
def get_geo(gid: int):
    with db() as c:
        r = row(c, gid); p = json.loads(r["params_json"]); V, _ = load_mesh(c, p)
    return {"id": gid, "name": r["name"], "version": r["version"], "params": p, **geo.stats(V)}

@router.put("/api/geometry/{gid}")
def update_geo(gid: int, g: GeoIn):
    check(g.params)
    with db() as c:
        r = row(c, gid); v = r["version"] + 1
        c.execute("UPDATE spacecraft_configurations SET name=?,params_json=?,version=? WHERE id=?", (g.name, json.dumps(g.params), v, gid))
        c.execute("INSERT INTO geometry_versions(config_id,version,snapshot_json) VALUES(?,?,?)", (gid, v, json.dumps(g.params)))
    return {"id": gid, "version": v}

@router.get("/api/geometry/{gid}/versions")
def geo_versions(gid: int):
    with db() as c:
        return [dict(r) for r in c.execute("SELECT version,snapshot_json,created_at FROM geometry_versions WHERE config_id=? ORDER BY version DESC", (gid,))]

@router.post("/api/geometry/{gid}/duplicate")
def dup_geo(gid: int):
    with db() as c:
        r = row(c, gid)
        return {"id": _insert(c, r["name"] + " (copy)", json.loads(r["params_json"]), r["project_id"])}

@router.get("/api/geometry/{gid}/mesh")
def mesh(gid: int):
    """Triangles, outward normals and areas for 3D view / surface inspection."""
    with db() as c:
        V, sheet = load_mesh(c, json.loads(row(c, gid)["params_json"]))
    n, A, _ = fmf.geom(V)
    return {"triangles": V.tolist(), "normals": n.tolist(), "areas_m2": A.tolist(), "thin_membrane": sheet.tolist()}

@router.get("/api/geometry/{gid}/export.stl")
def export_stl(gid: int):
    with db() as c:
        V, _ = load_mesh(c, json.loads(row(c, gid)["params_json"]))
    n, _, _ = fmf.geom(V)
    s = "solid aerosim\n" + "".join(f"facet normal {a[0]:e} {a[1]:e} {a[2]:e}\nouter loop\n" + "".join(f"vertex {p[0]:e} {p[1]:e} {p[2]:e}\n" for p in t) + "endloop\nendfacet\n" for a, t in zip(n, V)) + "endsolid aerosim\n"
    return Response(s, media_type="model/stl")

@router.post("/api/geometry/{gid}/stl")
async def upload_stl(gid: int, file: UploadFile = File(...), scale_to_m: float = Form(1.0)):
    raw = await file.read()
    try: geo.read_stl(raw, scale_to_m)
    except ValueError as e: raise HTTPException(422, str(e))
    sha = hashlib.sha256(raw).hexdigest()
    path = DATA / "geometry" / f"{sha[:12]}_{re.sub(r'[^\w.\-]', '_', file.filename or 'mesh.stl')}"
    path.write_bytes(raw)
    with db() as c:
        r = row(c, gid); p = json.loads(r["params_json"]); v = r["version"] + 1
        fid = c.execute("INSERT INTO geometry_files(config_id,filename,stored_path,sha256) VALUES(?,?,?,?)", (gid, file.filename, str(path), sha)).lastrowid
        p.update(stl_file_id=fid, stl_scale=scale_to_m)
        c.execute("UPDATE spacecraft_configurations SET params_json=?,version=? WHERE id=?", (json.dumps(p), v, gid))
        c.execute("INSERT INTO geometry_versions(config_id,version,snapshot_json) VALUES(?,?,?)", (gid, v, json.dumps(p)))
    return {"file_id": fid, "version": v}

# ---------------- FMF ----------------
class FMFRun(BaseModel):
    geometry_id: int
    dataset_id: int | None = None
    altitudes_km: list[float]
    manual_atmosphere: dict | None = None      # {"T_k": .., "species_m3": {"O": ..}}
    velocity_m_s: float | None = None
    beta_deg: float | None = None
    phi_deg: float = 0.0
    model: Literal["sentman", "maxwell"] = "sentman"
    sigma: float = 1.0
    alpha: float = 1.0
    t_wall_k: float | None = None
    reference_area_m2: float | None = None
    reference_length_m: float | None = None
    moment_ref_m: list[float] = [0, 0, 0]

def interp(x, xs, ys):
    ys = np.asarray(ys, float)
    return float(np.exp(np.interp(x, xs, np.log(ys)))) if (ys > 0).all() else float(np.interp(x, xs, ys))

def atmosphere_at(req, alt_km, ds, warnings):
    if req.manual_atmosphere:
        T, sp = req.manual_atmosphere["T_k"], req.manual_atmosphere["species_m3"]
    else:
        if ds is None: raise HTTPException(422, "Provide dataset_id or manual_atmosphere")
        xs = ds["altitude_km"]
        if not xs[0] <= alt_km <= xs[-1]: raise HTTPException(422, f"Altitude {alt_km} km outside dataset range {xs[0]}-{xs[-1]} km (no extrapolation)")
        if any(t is None for t in ds["temperature_k"]): raise HTTPException(422, "Dataset has no temperature; use manual_atmosphere")
        if not ds["species_m3"]: raise HTTPException(422, "Dataset has no species densities; use manual_atmosphere")
        T = float(np.interp(alt_km, xs, ds["temperature_k"])); sp = {k: interp(alt_km, xs, v) for k, v in ds["species_m3"].items()}
    known = {k: v for k, v in sp.items() if k in fmf.SPECIES_MASS}
    for k in set(sp) - set(known): warnings.append(f"species '{k}' has no known molecular mass and was skipped")
    if not known: raise HTTPException(422, "No usable species")
    return T, known

@router.post("/api/fmf/run")
def run_fmf(req: FMFRun):
    if not (0 <= req.sigma <= 1 and 0 <= req.alpha <= 1): raise HTTPException(422, "sigma and alpha must be in [0,1]")
    with db() as c:
        r = row(c, req.geometry_id); p = json.loads(r["params_json"]); V, sheet = load_mesh(c, p)
    ds = get_dataset(req.dataset_id) if req.dataset_id and not req.manual_atmosphere else None
    beta = req.beta_deg if req.beta_deg is not None else p.get("orientation_deg", {}).get("beta", 0.0)
    Tw = req.t_wall_k or p.get("surface", {}).get("t_wall_k", 300.0)
    vhat = fmf.flow_dir(beta, req.phi_deg); bb = np.ptp(V.reshape(-1, 3), axis=0)
    L = req.reference_length_m or float(bb.max()); rows, warns_all = [], []
    for alt in req.altitudes_km:
        w = []
        T, atm = atmosphere_at(req, alt, ds, w)
        speed = req.velocity_m_s or fmf.orbital_speed(alt * 1e3)
        try: res = fmf.evaluate(V, sheet, vhat, atm, T, Tw, speed, req.model, req.sigma, req.alpha, req.reference_area_m2, req.moment_ref_m)
        except ValueError as e: raise HTTPException(422, str(e))
        lam = fmf.mean_free_path(atm); kn = lam / L
        if kn <= 10: w.append(f"Kn={kn:.3g}: free-molecular assumption NOT appropriate ({fmf.regime(kn)} regime); results unreliable")
        if min(res["speed_ratio"].values()) < 3: w.append("Speed ratio < 3 for some species: leeward thermal flux neglected")
        rows.append({"altitude_km": alt, "T_k": T, "speed_m_s": speed, "species_m3": atm, "mean_free_path_m": lam, "Kn": kn,
                     "regime": fmf.regime(kn), **res, "warnings": w}); warns_all += w
    out = {"model": req.model, "model_version": fmf.VERSION, "date": datetime.now(timezone.utc).isoformat(),
           "inputs": {**req.model_dump(), "beta_deg": beta, "t_wall_k": Tw, "reference_length_m": L},
           "dataset_ref": req.dataset_id, "geometry_ref": {"id": req.geometry_id, "version": r["version"]},
           "units": {"force": "N", "moment": "N m", "area": "m^2", "speed": "m/s", "density": "m^-3 (species), kg/m^3 (total)", "length": "m", "T": "K"},
           "equations": fmf.EQUATIONS, "assumptions": fmf.ASSUMPTIONS, "limitations": fmf.LIMITATIONS, "results": rows}
    with db() as c:
        fid = c.execute("INSERT INTO fmf_configurations(project_id,name,params_json,dataset_id,spacecraft_id) VALUES(?,?,?,?,?)",
                        (r["project_id"], f"FMF {req.model}", req.model_dump_json(), req.dataset_id, req.geometry_id)).lastrowid
        out["id"] = c.execute("INSERT INTO fmf_results(fmf_id,results_json,model_version) VALUES(?,?,?)", (fid, json.dumps(out), fmf.VERSION)).lastrowid
        log(c, "fmf", f"FMF ({req.model}) run on geometry {req.geometry_id}, {len(rows)} altitude(s)")
    return out

@router.get("/api/fmf/results")
def list_fmf():
    with db() as c:
        return [dict(r) for r in c.execute("SELECT id,fmf_id,model_version,created_at FROM fmf_results ORDER BY id DESC")]

@router.get("/api/fmf/results/{rid}")
def get_fmf(rid: int):
    with db() as c:
        r = c.execute("SELECT results_json FROM fmf_results WHERE id=?", (rid,)).fetchone()
    if not r: raise HTTPException(404, "Result not found")
    return json.loads(r["results_json"])
