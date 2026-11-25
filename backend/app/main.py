"""AEROSIM backend - Phase 1: foundation + atmospheric data manager (no paid services)."""
import hashlib, json, math, os, re, sqlite3
from pathlib import Path
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

ROOT = Path(__file__).resolve().parents[1]
DATA = Path(os.environ.get("AEROSIM_DATA", ROOT / "data"))
(DATA / "atmosphere").mkdir(parents=True, exist_ok=True)

def db():
    c = sqlite3.connect(DATA / "aerosim.db")
    c.row_factory = sqlite3.Row
    c.execute("PRAGMA foreign_keys=ON")
    return c

with db() as _c:
    _c.executescript((Path(__file__).parent / "schema.sql").read_text())

from . import __version__
app = FastAPI(title="AEROSIM", version=__version__)
app.add_middleware(CORSMiddleware, allow_origins=["http://localhost:5173"], allow_methods=["*"], allow_headers=["*"])

# ---- unit tables (factor to SI) ----
LEN = {"km": 1e3, "m": 1.0}
NUM = {"cm^-3": 1e6, "m^-3": 1.0}
MASS = {"g/cm3": 1e3, "kg/m3": 1.0}
TOFF = {"K": 0.0, "C": 273.15}
AMU = 1.66053907e-27
SPECIES_MASS = {"O": 15.999, "Anomalous O": 15.999, "N2": 28.0134, "O2": 31.998,
                "He": 4.0026, "Ar": 39.948, "H": 1.00794, "N": 14.0067}

def log(c, kind, msg):
    c.execute("INSERT INTO activity_log(kind,message) VALUES(?,?)", (kind, msg))

def read_table(raw: bytes):
    text = raw.decode("utf-8-sig", errors="replace")
    lines = [l for l in text.splitlines() if l.strip() and not l.lstrip().startswith(("#", "%"))]
    if len(lines) < 2:
        raise HTTPException(400, "File needs a header row and at least one data row")
    delim = "," if "," in lines[0] else "\t" if "\t" in lines[0] else ";" if ";" in lines[0] else None
    rows = [[x.strip() for x in (l.split(delim) if delim else l.split())] for l in lines]
    return rows[0], rows[1:]

def suggest(header):
    m = {"altitude": None, "temperature": None, "total_density": None, "species": []}
    for h in header:
        k = re.sub(r"[\(\[].*?[\)\]]", "", h).strip()
        l, hl = k.lower().replace(" ", "_"), h.lower()
        if l in ("t_alt", "t", "temp", "temperature") and not m["temperature"]:
            m["temperature"] = {"column": h, "unit": "K"}
        elif re.search(r"alt|height", l) and not m["altitude"]:
            m["altitude"] = {"column": h, "unit": "m" if "(m)" in hl or "[m]" in hl else "km"}
        elif re.search(r"total|mass_dens|rho", l) and not m["total_density"]:
            m["total_density"] = {"column": h, "unit": "kg/m3" if "kg" in hl else "g/cm3"}
        elif k in SPECIES_MASS:
            m["species"].append({"name": k, "column": h,
                                 "unit": "m^-3" if "m^-3" in hl and "cm" not in hl else "cm^-3"})
    return m

def find_duplicate(c, sha):
    r = c.execute("SELECT id,name FROM atmospheric_datasets WHERE file_sha256=?", (sha,)).fetchone()
    return dict(r) if r else None

@app.post("/api/atmosphere/inspect")
async def inspect(file: UploadFile = File(...)):
    raw = await file.read()
    header, rows = read_table(raw)
    sha = hashlib.sha256(raw).hexdigest()
    with db() as c:
        dup = find_duplicate(c, sha)
    return {"filename": file.filename, "header": header, "n_rows": len(rows), "preview": rows[:10],
            "suggested_mapping": suggest(header), "duplicate_of": dup,
            "units": {"length": list(LEN), "number_density": list(NUM), "mass_density": list(MASS), "temperature": list(TOFF)}}

def unit_factor(table, spec, what):
    u = spec.get("unit")
    if u not in table:
        raise HTTPException(400, f"{what}: unknown unit '{u}'. Allowed: {list(table)}")
    return table[u]

def build(header, rows, mp):
    idx = {h: i for i, h in enumerate(header)}
    def ci(spec, what):
        if not spec or spec.get("column") not in idx:
            raise HTTPException(400, f"{what}: column not mapped or not found in file")
        return idx[spec["column"]]
    ia = ci(mp.get("altitude"), "altitude"); fa = unit_factor(LEN, mp["altitude"], "altitude")
    it = ird = None; toff = fr = 0.0
    if mp.get("temperature"):
        it = ci(mp["temperature"], "temperature"); toff = unit_factor(TOFF, mp["temperature"], "temperature")
    if mp.get("total_density"):
        ird = ci(mp["total_density"], "total density"); fr = unit_factor(MASS, mp["total_density"], "total density")
    spf = [(s["name"], ci(s, f"species {s.get('name')}"), unit_factor(NUM, s, f"species {s.get('name')}"))
           for s in mp.get("species", [])]
    if ird is None and not spf:
        raise HTTPException(400, "Map total density or at least one species")
    recs, errors, warnings = [], [], []
    for n, r in enumerate(rows, start=2):
        try:
            alt = float(r[ia]) * fa
            T = float(r[it]) + toff if it is not None else None
            rho = float(r[ird]) * fr if ird is not None else None
            ns = {name: float(r[i]) * f for name, i, f in spf}
        except (ValueError, IndexError):
            errors.append(f"row {n}: missing or non-numeric value"); continue
        vals = [alt] + [v for v in (T, rho) if v is not None] + list(ns.values())
        if not all(math.isfinite(v) for v in vals): errors.append(f"row {n}: non-finite value")
        elif alt < 0: errors.append(f"row {n}: negative altitude")
        elif rho is not None and rho <= 0: errors.append(f"row {n}: total density must be > 0")
        elif T is not None and not 50 <= T <= 5000: errors.append(f"row {n}: temperature {T:.1f} K outside 50-5000 K")
        elif any(v < 0 for v in ns.values()): errors.append(f"row {n}: negative species density")
        else: recs.append({"alt": alt, "T": T, "rho": rho, "sp": ns})
    recs.sort(key=lambda r: r["alt"])
    if len({r["alt"] for r in recs}) != len(recs):
        errors.append("duplicate altitude values: profile is ambiguous")
    if not recs and not errors:
        errors.append("no data rows")
    known = all(s in SPECIES_MASS for s, _, _ in spf) and spf
    if known:
        worst = 0.0
        for r in recs:
            d = sum(v * SPECIES_MASS[s] * AMU for s, v in r["sp"].items())
            if r["rho"] is None:
                r["rho"] = d
            elif r["rho"] > 0:
                worst = max(worst, abs(d - r["rho"]) / r["rho"])
        if ird is None:
            warnings.append("total density derived from mapped species; unmapped species are excluded")
        elif worst > 0.2:
            warnings.append(f"species mass density differs from total density by up to {worst:.0%}; check units or unmapped species")
    elif spf:
        warnings.append("unknown species mass: species/total density consistency not checked")
    return recs, errors, warnings

@app.post("/api/atmosphere/datasets")
async def create_dataset(file: UploadFile = File(...), name: str = Form(...), mapping: str = Form(...),
                         metadata: str = Form("{}"), allow_duplicate: bool = Form(False)):
    raw = await file.read()
    sha = hashlib.sha256(raw).hexdigest()
    try:
        mp, meta = json.loads(mapping), json.loads(metadata)
    except json.JSONDecodeError:
        raise HTTPException(400, "mapping/metadata must be valid JSON")
    with db() as c:
        dup = find_duplicate(c, sha)
        if dup and not allow_duplicate:
            raise HTTPException(409, {"message": "This exact file was already uploaded", "existing": dup})
        header, rows = read_table(raw)
        recs, errors, warnings = build(header, rows, mp)
        if errors:
            raise HTTPException(422, {"errors": errors[:50], "total_errors": len(errors)})
        chash = hashlib.sha256(json.dumps([[r["alt"], r["T"], r["rho"], sorted(r["sp"].items())] for r in recs]).encode()).hexdigest()
        safe = re.sub(r"[^\w.\-]", "_", file.filename or "upload.txt")
        path = DATA / "atmosphere" / f"{sha[:12]}_{safe}"
        path.write_bytes(raw)  # original preserved untouched
        cur = c.execute("""INSERT INTO atmospheric_datasets(project_id,name,original_filename,stored_path,file_sha256,content_sha256,
            source,model,description,mapping_json,metadata_json,n_rows) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)""",
            (meta.get("project_id"), name, file.filename, str(path), sha, chash, meta.get("source"),
             meta.get("model", "NRLMSISE-00"), meta.get("description"), json.dumps(mp), json.dumps(meta), len(recs)))
        did = cur.lastrowid
        for r in recs:
            pid = c.execute("INSERT INTO atmospheric_profiles(dataset_id,altitude_m,temperature_k,total_density_kg_m3) VALUES(?,?,?,?)",
                            (did, r["alt"], r["T"], r["rho"])).lastrowid
            c.executemany("INSERT INTO atmospheric_species(dataset_id,profile_id,species,number_density_m3) VALUES(?,?,?,?)",
                          [(did, pid, s, v) for s, v in r["sp"].items()])
        c.execute("INSERT INTO dataset_versions(dataset_id,version,snapshot_json) VALUES(?,1,?)",
                  (did, json.dumps({"name": name, "metadata": meta})))
        if c.execute("SELECT 1 FROM atmospheric_datasets WHERE content_sha256=? AND id<>?", (chash, did)).fetchone():
            warnings.append("parsed content is identical to an existing dataset")
        log(c, "atmosphere", f"Uploaded dataset '{name}' ({len(recs)} rows)")
    return {"id": did, "n_rows": len(recs), "warnings": warnings}

@app.get("/api/atmosphere/datasets")
def list_datasets():
    with db() as c:
        return [dict(r) for r in c.execute(
            "SELECT id,name,original_filename,source,model,n_rows,version,uploaded_at FROM atmospheric_datasets ORDER BY id DESC")]

@app.get("/api/atmosphere/datasets/{did}")
def get_dataset(did: int):
    with db() as c:
        d = c.execute("SELECT * FROM atmospheric_datasets WHERE id=?", (did,)).fetchone()
        if not d:
            raise HTTPException(404, "Dataset not found")
        prof = c.execute("SELECT altitude_m,temperature_k,total_density_kg_m3 FROM atmospheric_profiles WHERE dataset_id=? ORDER BY altitude_m", (did,)).fetchall()
        sp = {}
        for r in c.execute("""SELECT s.species sp, s.number_density_m3 n FROM atmospheric_species s
                              JOIN atmospheric_profiles p ON p.id=s.profile_id WHERE s.dataset_id=? ORDER BY p.altitude_m""", (did,)):
            sp.setdefault(r["sp"], []).append(r["n"])
    out = {k: d[k] for k in d.keys() if k not in ("mapping_json", "metadata_json")}
    out.update(mapping=json.loads(d["mapping_json"]), metadata=json.loads(d["metadata_json"]),
               units={"altitude": "km", "temperature": "K", "total_density": "kg/m^3", "species": "m^-3"},
               altitude_km=[r["altitude_m"] / 1e3 for r in prof], temperature_k=[r["temperature_k"] for r in prof],
               total_density_kg_m3=[r["total_density_kg_m3"] for r in prof], species_m3=sp)
    return out

class MetaUpdate(BaseModel):
    name: str | None = None
    source: str | None = None
    model: str | None = None
    description: str | None = None
    metadata: dict | None = None

@app.patch("/api/atmosphere/datasets/{did}")
def update_dataset(did: int, u: MetaUpdate):
    with db() as c:
        d = c.execute("SELECT * FROM atmospheric_datasets WHERE id=?", (did,)).fetchone()
        if not d:
            raise HTTPException(404, "Dataset not found")
        v = d["version"] + 1
        new = {"name": u.name or d["name"], "source": u.source if u.source is not None else d["source"],
               "model": u.model or d["model"], "description": u.description if u.description is not None else d["description"],
               "metadata": json.dumps(u.metadata) if u.metadata is not None else d["metadata_json"]}
        c.execute("UPDATE atmospheric_datasets SET name=?,source=?,model=?,description=?,metadata_json=?,version=? WHERE id=?",
                  (new["name"], new["source"], new["model"], new["description"], new["metadata"], v, did))
        c.execute("INSERT INTO dataset_versions(dataset_id,version,snapshot_json) VALUES(?,?,?)", (did, v, json.dumps(new)))
        log(c, "atmosphere", f"Edited metadata of dataset {did} (v{v})")
    return {"id": did, "version": v}

@app.get("/api/atmosphere/datasets/{did}/versions")
def versions(did: int):
    with db() as c:
        return [dict(r) for r in c.execute("SELECT version,snapshot_json,changed_at FROM dataset_versions WHERE dataset_id=? ORDER BY version DESC", (did,))]

class ProjectIn(BaseModel):
    name: str
    description: str | None = None

@app.post("/api/projects")
def create_project(p: ProjectIn):
    with db() as c:
        pid = c.execute("INSERT INTO projects(name,description) VALUES(?,?)", (p.name, p.description)).lastrowid
        log(c, "project", f"Created project '{p.name}'")
    return {"id": pid}

@app.get("/api/projects")
def list_projects():
    with db() as c:
        return [dict(r) for r in c.execute("SELECT * FROM projects ORDER BY id DESC")]

@app.get("/api/dashboard")
def dashboard():
    t = {"projects": "projects", "atmospheric_datasets": "atmospheric_datasets", "spacecraft_configurations": "spacecraft_configurations",
         "fmf_calculations": "fmf_results", "dsmc_configurations": "dsmc_configurations", "comparison_reports": "reports"}
    with db() as c:
        out = {k: c.execute(f"SELECT COUNT(*) FROM {v}").fetchone()[0] for k, v in t.items()}
        out["completed_simulations"] = c.execute("SELECT COUNT(*) FROM dsmc_jobs WHERE status='completed'").fetchone()[0]
        out["recent_activity"] = [dict(r) for r in c.execute("SELECT kind,message,created_at FROM activity_log ORDER BY id DESC LIMIT 10")]
    return out

from .routes_phase2 import router  # noqa: E402  (Phase 2 routes)
app.include_router(router)

from .routes_dsmc import router as dsmc_router  # noqa: E402  (Phase 3 routes)
app.include_router(dsmc_router)
