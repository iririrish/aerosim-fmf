import { KB, SPECIES, speciesMass, MU_EARTH, R_EARTH, OMEGA_EARTH } from '../../data/constants.js';

export const mostProbableSpeed = (T, m) => Math.sqrt((2 * KB * T) / m); // v_mp = sqrt(2 kB T / m)

// Species list from a record; anomalous O is added to O only when mode==='add' (avoid double counting).
export function composition(rec, anomMode = 'add') {
  const sp = { ...rec.species };
  if (anomMode === 'add' && sp.oanom !== undefined) sp.o = (sp.o ?? 0) + sp.oanom;
  return Object.keys(SPECIES).filter((k) => sp[k] !== undefined)
    .map((k) => ({ key: k, n: sp[k], m: speciesMass(k), d: SPECIES[k].d, dSource: SPECIES[k].dSource }));
}
export const massDensity = (comp) => comp.reduce((s, c) => s + c.n * c.m, 0);

// Bird (1994): lambda_i = 1 / sum_j n_j pi d_ij^2 sqrt(1 + m_i/m_j), d_ij=(d_i+d_j)/2; mixture lambda = sum_i (n_i/n) lambda_i
export function speciesMeanFreePaths(comp) {
  return comp.map((i) => 1 / comp.reduce((inv, j) => inv + j.n * Math.PI * ((i.d + j.d) / 2) ** 2 * Math.sqrt(1 + i.m / j.m), 0));
}
export function meanFreePath(comp) {
  const nTot = comp.reduce((s, c) => s + c.n, 0);
  if (!(nTot > 0)) return Infinity;
  const li = speciesMeanFreePaths(comp);
  return comp.reduce((s, c, k) => s + (c.n / nTot) * li[k], 0);
}

export const DEFAULT_REGIMES = { continuum: 1e-3, slip: 0.1, transitional: 10 };
export function classifyKn(kn, t = DEFAULT_REGIMES) {
  if (kn < t.continuum) return 'continuum';
  if (kn < t.slip) return 'slip';
  if (kn <= t.transitional) return 'transitional';
  return 'free molecular';
}

const sc = (a, s) => a.map((x) => x * s);
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

// Circular orbit, inertial frame (z = Earth spin axis). Atmosphere = optional rigid co-rotation + wind (east, north, up; m/s).
export function relativeVelocity({ hKm, incDeg, argLatDeg, corot, wind = [0, 0, 0] }) {
  const r = R_EARTH + hKm * 1e3, v = Math.sqrt(MU_EARTH / r);
  const i = (incDeg * Math.PI) / 180, u = (argLatDeg * Math.PI) / 180;
  const rh = [Math.cos(u), Math.sin(u) * Math.cos(i), Math.sin(u) * Math.sin(i)];
  const vh = [-Math.sin(u), Math.cos(u) * Math.cos(i), Math.cos(u) * Math.sin(i)];
  const vSc = sc(vh, v);
  const vCo = corot ? [-OMEGA_EARTH * r * rh[1], OMEGA_EARTH * r * rh[0], 0] : [0, 0, 0];
  const e0 = [-rh[1], rh[0], 0], en = Math.hypot(...e0);
  const east = en > 1e-12 ? sc(e0, 1 / en) : [1, 0, 0], north = cross(rh, east);
  const w = [0, 1, 2].map((k) => east[k] * wind[0] + north[k] * wind[1] + rh[k] * wind[2]);
  const rel = [0, 1, 2].map((k) => vSc[k] - vCo[k] - w[k]);
  const V = Math.hypot(...rel);
  return { vOrbital: v, vCorot: Math.hypot(...vCo), V, dir: V > 0 ? sc(rel, 1 / V) : [0, 0, 0] };
}
