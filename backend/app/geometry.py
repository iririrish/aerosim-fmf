"""Spacecraft mesh generation (triangle soup, SI units, body frame: origin at box centre, sail axis +z)."""
import re
import numpy as np

_FACES = [(0, 2, 3, 1), (4, 5, 7, 6), (0, 1, 5, 4), (2, 6, 7, 3), (0, 4, 6, 2), (1, 3, 7, 5)]  # outward normals

def box_mesh(x, y, z):
    h = np.array([x, y, z]) / 2
    c = np.array([[sx, sy, sz] for sz in (-1, 1) for sy in (-1, 1) for sx in (-1, 1)]) * h
    return np.array([[c[a], c[b], c[d]] for q in _FACES for a, b, d in ((q[0], q[1], q[2]), (q[0], q[2], q[3]))])

def cone_mesh(base_d, half_angle_deg, z0, n=64):
    """Thin conical membrane (open base at z=z0, apex at +z). Normals point outward."""
    R = base_d / 2
    h = R / np.tan(np.radians(half_angle_deg))
    a = np.linspace(0, 2 * np.pi, n + 1)
    b = np.stack([R * np.cos(a), R * np.sin(a), np.full_like(a, z0)], axis=1)
    apex = np.array([0, 0, z0 + h])
    return np.array([[b[k], b[k + 1], apex] for k in range(n)])

def read_stl(raw: bytes, scale=1.0):
    if raw[:5].lower() == b"solid" and b"facet" in raw[:2000]:
        v = np.array(re.findall(rb"vertex\s+(\S+)\s+(\S+)\s+(\S+)", raw), dtype=float)
    else:
        rec = np.frombuffer(raw[84:], dtype=np.dtype([("n", "<f4", 3), ("v", "<f4", (3, 3)), ("a", "<u2")]))
        v = rec["v"].astype(float).reshape(-1, 3)
    if len(v) == 0 or len(v) % 3:
        raise ValueError("could not parse STL triangles")
    return v.reshape(-1, 3, 3) * scale

def build_mesh(p, stl_raw=None):
    """Returns (V[N,3,3], sheet[N]); sheet=True marks thin two-sided membrane panels."""
    parts, flags = [], []
    if stl_raw is not None:
        parts.append(read_stl(stl_raw, p.get("stl_scale", 1.0)))
    else:
        b = p["body"]; parts.append(box_mesh(b["x"], b["y"], b["z"]))
    flags.append(np.zeros(len(parts[0]), bool))
    sl = p.get("sail", {})
    if sl.get("enabled"):
        z0 = p["body"]["z"] / 2
        s = cone_mesh(sl["base_diameter_m"], sl["half_angle_deg"], z0, sl.get("segments", 64))
        parts.append(s); flags.append(np.ones(len(s), bool))
    return np.concatenate(parts), np.concatenate(flags)

def stats(V):
    a = 0.5 * np.linalg.norm(np.cross(V[:, 1] - V[:, 0], V[:, 2] - V[:, 0]), axis=1)
    return {"n_triangles": len(V), "surface_area_m2": float(a.sum()),
            "bbox_min": V.reshape(-1, 3).min(0).tolist(), "bbox_max": V.reshape(-1, 3).max(0).tolist()}
