"""Free-molecular flow engine: Maxwell and Sentman gas-surface models on triangular panels."""
import numpy as np
from scipy.special import erf

K_B, AMU, MU_E, R_E = 1.380649e-23, 1.66053907e-27, 3.986004418e14, 6378137.0
SPECIES_MASS = {"O": 15.999, "Anomalous O": 15.999, "N2": 28.0134, "O2": 31.998, "He": 4.0026, "Ar": 39.948, "H": 1.00794, "N": 14.0067}
DIAM = {"O": 3.0e-10, "Anomalous O": 3.0e-10, "N2": 4.17e-10, "O2": 4.07e-10, "He": 2.33e-10, "Ar": 4.17e-10, "H": 2.5e-10, "N": 3.0e-10}  # approx. hard-sphere/VHS reference diameters (Bird 1994; O, N, H approximate)
VERSION = "aerosim-fmf 0.1.0"

def orbital_speed(alt_m):
    return float(np.sqrt(MU_E / (R_E + alt_m)))

def flow_dir(beta_deg, phi_deg=0.0):
    """Unit vector of gas motion relative to body. beta=0: flow along -z (sail apex faces flow); beta=180: open side faces flow."""
    b, f = np.radians(beta_deg), np.radians(phi_deg)
    return np.array([np.sin(b) * np.cos(f), np.sin(b) * np.sin(f), -np.cos(b)])

def coeffs(g, s, T, Tw, model="sentman", sigma=1.0, alpha=1.0):
    """Pressure/shear coefficients (normalised by q=0.5*rho_i*V^2) for panel(s) facing flow, g=cos(angle between inward normal and flow)."""
    g = np.asarray(g, float); mu = np.sqrt(np.clip(1 - g * g, 0, None))
    ex = np.exp(-(g * s) ** 2); er = 1 + erf(g * s)
    E = ex + np.sqrt(np.pi) * g * s * er                         # incident number-flux factor
    cp_i = ex * g / (np.sqrt(np.pi) * s) + (0.5 + (g * s) ** 2) * er / s ** 2   # incident normal momentum
    ct_i = mu * E / (np.sqrt(np.pi) * s)                          # incident tangential momentum
    if model == "maxwell":   # fraction sigma diffuse at Tw, (1-sigma) specular
        cp = (2 - sigma) * cp_i + sigma * E / (2 * s ** 2) * np.sqrt(Tw / T)
        return cp, sigma * ct_i
    F = (s ** 2 + 2.5) * E - 0.5 * ex                             # incident energy flux factor
    Ti = T * F / (2 * E)                                          # mean incident (flux-weighted) kinetic temperature
    Tr = Ti + alpha * (Tw - Ti)                                   # Sentman: energy accommodation sets re-emission temperature
    return cp_i + E / (2 * s ** 2) * np.sqrt(Tr / T), ct_i

def geom(V):
    c = np.cross(V[:, 1] - V[:, 0], V[:, 2] - V[:, 0]); a2 = np.linalg.norm(c, axis=1)
    return c / a2[:, None], 0.5 * a2, V.mean(axis=1)

def shadowed(V, origins, own, vhat, chunk=128):
    """Moller-Trumbore: is the ray from each origin towards the oncoming flow blocked by any triangle (own excluded)?"""
    if len(V) > 20000:
        raise ValueError("mesh too large for built-in shadow test (max 20000 triangles); decimate the mesh")
    d = -vhat; e1, e2 = V[:, 1] - V[:, 0], V[:, 2] - V[:, 0]
    h = np.cross(d, e2); a = e1 @ h.T if False else np.einsum("nk,nk->n", e1, h)
    ok = np.abs(a) > 1e-14; f = np.where(ok, 1 / np.where(ok, a, 1), 0)
    eps = 1e-9 * np.ptp(V.reshape(-1, 3), axis=0).max(); out = np.zeros(len(origins), bool)
    for i in range(0, len(origins), chunk):
        O = origins[i:i + chunk]; s = O[:, None, :] - V[None, :, 0, :]
        u = f * np.einsum("pnk,nk->pn", s, h); q = np.cross(s, e1[None]); v = f * np.einsum("k,pnk->pn", d, q)
        t = f * np.einsum("nk,pnk->pn", e2, q)
        hit = ok & (u >= 0) & (v >= 0) & (u + v <= 1) & (t > eps)
        hit[np.arange(len(O)), own[i:i + chunk]] = False
        out[i:i + chunk] = hit.any(axis=1)
    return out

def evaluate(V, sheet, vhat, atm, T, Tw, speed, model="sentman", sigma=1.0, alpha=1.0, aref=None, ref_pt=(0, 0, 0)):
    n, A, C = geom(V)
    g = -n @ vhat
    flip = sheet & (g < 0)                       # thin membranes are two-sided
    n = np.where(flip[:, None], -n, n); g = -n @ vhat
    idx = np.where(g > 1e-9)[0]
    vis = np.zeros(len(V), bool); vis[idx] = ~shadowed(V, C[idx], idx, vhat)
    tv = vhat - (n @ vhat)[:, None] * n; mu = np.linalg.norm(tv, axis=1)
    that = np.where(mu[:, None] > 1e-12, tv / np.where(mu > 1e-12, mu, 1)[:, None], 0)
    Fp, Fs, M, rho, speed_ratio = np.zeros(3), np.zeros(3), np.zeros(3), 0.0, {}
    for sp, nn in atm.items():
        m = SPECIES_MASS[sp] * AMU; s = speed / np.sqrt(2 * K_B * T / m); speed_ratio[sp] = float(s)
        rho += nn * m; qi = 0.5 * nn * m * speed ** 2
        cp, ct = coeffs(g[vis], s, T, Tw, model, sigma, alpha)
        dFp = -(qi * A[vis] * cp)[:, None] * n[vis]; dFs = (qi * A[vis] * ct)[:, None] * that[vis]
        Fp += dFp.sum(0); Fs += dFs.sum(0); M += np.cross(C[vis] - np.asarray(ref_pt), dFp + dFs).sum(0)
    F = Fp + Fs; q = 0.5 * rho * speed ** 2; a_proj = float((A[vis] * g[vis]).sum()); aref = aref or a_proj
    drag = float(F @ vhat); lift_v = F - drag * vhat
    return {"force_N": F.tolist(), "pressure_force_N": Fp.tolist(), "shear_force_N": Fs.tolist(), "moment_Nm": M.tolist(),
            "drag_N": drag, "lift_N": float(np.linalg.norm(lift_v)), "normal_force_N": float(np.linalg.norm(Fp)),
            "tangential_force_N": float(np.linalg.norm(Fs)), "q_inf_Pa": q, "rho_kg_m3": rho, "A_proj_m2": a_proj, "A_ref_m2": aref,
            "Cd": drag / (q * aref), "Cl": float(np.linalg.norm(lift_v)) / (q * aref), "speed_ratio": speed_ratio,
            "n_panels": len(V), "n_exposed": int(vis.sum())}

def mean_free_path(atm):
    return float(1 / (np.sqrt(2) * np.pi * sum(n * DIAM[s] ** 2 for s, n in atm.items())))

def regime(kn):
    return "free-molecular" if kn > 10 else "transitional" if kn > 0.1 else "slip" if kn > 0.01 else "continuum"

EQUATIONS = [
    "s_i = V / sqrt(2 k T / m_i)   (speed ratio per species)",
    "E = exp(-g^2 s^2) + sqrt(pi) g s (1 + erf(g s)),  g = -n.v_hat",
    "Cp_inc = g exp(-g^2 s^2)/(sqrt(pi) s) + (1/2 + g^2 s^2)(1 + erf(g s))/s^2",
    "Ct_inc = sqrt(1-g^2) E / (sqrt(pi) s)",
    "Sentman: Cp = Cp_inc + E/(2 s^2) sqrt(Tr/T);  Tr = Ti + alpha (Tw - Ti);  Ti = T [(s^2+5/2)E - exp(-g^2 s^2)/2] / (2E)",
    "Maxwell: Cp = (2-sigma) Cp_inc + sigma E/(2 s^2) sqrt(Tw/T);  Ct = sigma Ct_inc",
    "dF = q_i A (-Cp n + Ct t_hat),  q_i = 0.5 n_i m_i V^2, summed over species and exposed panels",
    "Cd = F.v_hat / (q A_ref),  q = 0.5 rho V^2;  lambda = 1/(sqrt(2) pi sum n_i d_i^2);  Kn = lambda / L",
]
ASSUMPTIONS = ["Gas is a Maxwellian mixture; each species handled with its own speed ratio.",
               "Diffuse re-emission (Sentman) or Maxwell diffuse/specular mix; wall temperature uniform.",
               "Relative speed = circular orbital speed unless overridden; atmosphere co-rotation and winds ignored.",
               "Atmospheric profiles are interpolated (linear T, log-linear densities); no extrapolation."]
LIMITATIONS = ["No multiple reflections (matters for the open/concave side of a cone).",
               "Panels facing away from the flow or shadowed contribute zero (valid for speed ratio >~ 3).",
               "Shadowing uses panel centroids (binary); no partial shadowing.",
               "Mean free path uses approximate hard-sphere diameters; valid only for Kn >> 1.",
               "Atomic-oxygen adsorption / wall-temperature dependence of accommodation not modelled."]
