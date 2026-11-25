import os, tempfile, json
os.environ["AEROSIM_DATA"] = tempfile.mkdtemp()
from fastapi.testclient import TestClient
from app.main import app

c = TestClient(app)
CSV = ("Height(km),O,N2,Total mass density(g/cm3),T alt(K)\n"
       "400,5.0e7,1.0e6,1.3748e-15,950\n500,1.0e7,1.0e5,2.7031e-16,980\n")
F = lambda: {"file": ("nrl.csv", CSV.encode(), "text/csv")}

def test_flow():
    r = c.post("/api/atmosphere/inspect", files=F()).json()
    mp = r["suggested_mapping"]
    assert mp["altitude"]["unit"] == "km" and mp["temperature"]["column"] == "T alt(K)"
    assert [s["name"] for s in mp["species"]] == ["O", "N2"]
    r = c.post("/api/atmosphere/datasets", files=F(), data={"name": "t", "mapping": json.dumps(mp)})
    assert r.status_code == 200 and r.json()["warnings"] == []
    d = c.get(f"/api/atmosphere/datasets/{r.json()['id']}").json()
    assert d["altitude_km"] == [400.0, 500.0]
    assert abs(d["total_density_kg_m3"][0] - 1.3748e-12) < 1e-15
    assert abs(d["species_m3"]["O"][0] - 5.0e13) < 1
    assert c.post("/api/atmosphere/datasets", files=F(), data={"name": "t", "mapping": json.dumps(mp)}).status_code == 409
    assert c.patch(f"/api/atmosphere/datasets/{d['id']}", json={"name": "renamed"}).json()["version"] == 2
    mp["altitude"]["unit"] = "furlong"
    assert c.post("/api/atmosphere/datasets", files=F(), data={"name": "x", "mapping": json.dumps(mp), "allow_duplicate": "true"}).status_code == 400
