import json, numpy as np
from fastapi.testclient import TestClient
from app import fmf, geometry as geo
from app.main import app

c = TestClient(app)
ATM = {"O": 1e14}; T = 200.0; V0 = 7700.0
def run(V, sheet, beta, model="sentman", sigma=1.0, Tw=200.0, **k):
    return fmf.evaluate(V, sheet, fmf.flow_dir(beta), ATM, T, Tw, V0, model, sigma, **k)

def cone(theta=45):
    V = geo.cone_mesh(1.0, theta, 0.0, 128); return V, np.ones(len(V), bool)

def test_plate_specular_and_diffuse():
    V = geo.box_mesh(1, 1, 0.001); s = np.zeros(len(V), bool)
    sp = V0 / np.sqrt(2 * fmf.K_B * T / (15.999 * fmf.AMU))
    assert abs(run(V, s, 0, "maxwell", 0.0)["Cd"] - 4 * (1 + 1 / (2 * sp**2))) < 0.02     # specular ~4
    assert 2.0 < run(V, s, 0, "maxwell", 1.0, Tw=300)["Cd"] < 2.3                          # diffuse ~2+

def test_cone_hyperthermal_limits():
    V, sh = cone(45)
    cd = run(V, sh, 0, "maxwell", 1.0)["Cd"]; assert abs(cd - 2.0) < 0.15                  # diffuse: 2 independent of angle
    cs = run(V, sh, 0, "maxwell", 0.0)["Cd"]; assert abs(cs - 4 * np.sin(np.radians(45))**2) < 0.1   # specular: 4 sin^2(theta)
    assert abs(run(*cone(30), 0, "maxwell", 1.0)["Cd"] - cd) < 0.2
    assert abs(run(V, sh, 180, "maxwell", 1.0)["Cd"] - cd) < 0.2                           # open side (no multiple reflections)

def test_shadowing_hides_body():
    p = {"body": {"x": .1, "y": .1, "z": .3}, "sail": {"enabled": True, "half_angle_deg": 45, "base_diameter_m": 1.0}}
    V, sh = geo.build_mesh(p); Vs, shs = V[sh], sh[sh]
    a = run(V, sh, 0)["force_N"]; b = run(Vs, shs, 0)["force_N"]
    assert np.allclose(a, b, rtol=1e-9)

def test_api_flow():
    p = {"body": {"x": .1, "y": .1, "z": .3}, "mass_kg": 4, "surface": {"t_wall_k": 300}, "sail": {"enabled": True, "half_angle_deg": 45, "base_diameter_m": 1.0}}
    gid = c.post("/api/geometry", json={"name": "3U+sail", "params": p}).json()["id"]
    g = c.get(f"/api/geometry/{gid}").json(); assert g["n_triangles"] == 12 + 64 and g["surface_area_m2"] > 1
    assert c.post(f"/api/geometry/{gid}/duplicate").status_code == 200
    csv = "Height(km),O,N2,Total mass density(g/cm3),T alt(K)\n400,5.0e7,1.0e6,1.3748e-15,950\n500,1.0e7,1.0e5,2.7031e-16,980\n"
    mp = c.post("/api/atmosphere/inspect", files={"file": ("f.csv", csv.encode())}).json()["suggested_mapping"]
    did = c.post("/api/atmosphere/datasets", files={"file": ("f.csv", csv.encode())}, data={"name": "d", "mapping": json.dumps(mp), "allow_duplicate": "true"}).json()["id"]
    r = c.post("/api/fmf/run", json={"geometry_id": gid, "dataset_id": did, "altitudes_km": [450], "beta_deg": 0})
    assert r.status_code == 200, r.text
    row = r.json()["results"][0]; assert row["regime"] == "free-molecular" and 1.5 < row["Cd"] < 3.5 and row["drag_N"] > 0
    assert c.post("/api/fmf/run", json={"geometry_id": gid, "dataset_id": did, "altitudes_km": [700]}).status_code == 422
    lo = c.post("/api/fmf/run", json={"geometry_id": gid, "altitudes_km": [100], "manual_atmosphere": {"T_k": 190, "species_m3": {"N2": 1e19, "O": 5e17}}}).json()
    assert lo["results"][0]["warnings"]
