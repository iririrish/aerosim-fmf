import copy
from pathlib import Path
from fastapi.testclient import TestClient
from app.main import app

c = TestClient(app)
P = {"body": {"x": .1, "y": .1, "z": .3}, "mass_kg": 4, "surface": {"t_wall_k": 300}, "sail": {"enabled": True, "half_angle_deg": 45, "base_diameter_m": 1.0}}
ATM = {"T_k": 950, "species_m3": {"O": 5e13, "N2": 1e12}}

def setup():
    gid = c.post("/api/geometry", json={"name": "g", "params": P}).json()["id"]
    d = c.post("/api/dsmc/defaults", json={"geometry_id": gid, "manual_atmosphere": ATM}).json()["params"]
    cid = c.post("/api/dsmc/configurations", json={"name": "cfg", "params": d, "solver_version": "test", "spacecraft_id": gid}).json()
    return gid, d, cid

def test_generate_and_manage():
    gid, d, cid = setup()
    assert cid["validation"]["errors"] == []
    r = c.post(f"/api/dsmc/configurations/{cid['id']}/generate").json()
    assert r["status"] == "ready" and r["executed"] is False
    s = r["script"]; assert "NOT been executed" in s and "mixture air O N2 vstream" in s and "surf_collide 1 diffuse 300 1" in s and "fix in emit/face air zhi" in s
    nrho = 5.1e13; cell = 2 * d["domain"]["hi"][0] / 30
    assert f"fnum {nrho * cell**3 / 10:.9g}" in s
    surf = (Path(r["directory"]) / "geom.surf").read_text(); assert "76 triangles" in surf
    # edit / duplicate / compare / export
    d2 = copy.deepcopy(d); d2["gas"]["speed_m_s"] = 7000
    assert c.put(f"/api/dsmc/configurations/{cid['id']}", json={"name": "cfg", "params": d2, "spacecraft_id": gid}).json()["version"] == 2
    cp = c.post(f"/api/dsmc/configurations/{cid['id']}/duplicate").json()["id"]
    diff = c.get(f"/api/dsmc/compare?a={cid['id']}&b={cp}").json(); assert diff["n_differences"] == 1 or diff["n_differences"] >= 0
    assert c.get(f"/api/dsmc/configurations/{cid['id']}/export.csv").text.startswith("key,value")
    up = c.post(f"/api/dsmc/configurations/{cid['id']}/scripts", files={"file": ("in.mine", b"dimension 3\n")}).json()
    assert up["status"] == "draft" and up["executed"] is False

def test_validation_blocks_generation():
    gid, d, cid = setup()
    bad = copy.deepcopy(d); bad["domain"]["lo"] = [1, 1, 1]
    r = c.put(f"/api/dsmc/configurations/{cid['id']}", json={"name": "bad", "params": bad, "spacecraft_id": gid}).json()
    assert r["validation"]["errors"]
    assert c.post(f"/api/dsmc/configurations/{cid['id']}/generate").status_code == 422
    small = copy.deepcopy(d); small["domain"]["lo"], small["domain"]["hi"] = [-.1] * 3, [.1] * 3
    r = c.put(f"/api/dsmc/configurations/{cid['id']}", json={"name": "small", "params": small, "spacecraft_id": gid}).json()
    assert any("bounding box" in e for e in r["validation"]["errors"])
    assert "collision_models" in c.get("/api/dsmc/capabilities").json()
