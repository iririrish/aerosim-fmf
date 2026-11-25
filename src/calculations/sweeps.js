import { runFMF } from './engine.js';

export const PARAMS = {
  altitude: { label: 'Altitude (dataset records)', unit: 'km' },
  incl: { label: 'Sail inclination', unit: 'deg' },
  areaFactor: { label: 'Sail area factor (× nominal)', unit: '' },
  alpha: { label: 'Energy accommodation α', unit: '', model: 'sentman' },
  sigma: { label: 'Diffuse fraction σ', unit: '', model: 'maxwell' },
  Tw: { label: 'Surface temperature', unit: 'K' },
  densityFactor: { label: 'Density factor (× record)', unit: '' },
  T: { label: 'Atmospheric temperature T∞', unit: 'K' },
  V: { label: 'Relative speed', unit: 'm/s' },
};
export const OUTPUTS = { drag: ['Drag force', 'N'], Cd: ['Drag coefficient', ''], accel: ['Drag acceleration', 'm/s²'], lift: ['Lift / side force', 'N'], Kn: ['Knudsen number', ''] };

function scaleArea(i, f) {
  const s = Math.sqrt(f);
  for (const k of ['L', 'W', 'D', 'Lc']) if (i[k] !== '' && i[k] !== undefined) i[k] = String(Number(i[k]) * s);
  if (i.Aref !== '') i.Aref = String(Number(i.Aref) * f);
  if (i.geometry === 'custom') { try { i.panelsJson = JSON.stringify(JSON.parse(i.panelsJson).map((p) => ({ ...p, area: p.area * f }))); } catch { /* engine reports it */ } }
}
export function evalCase(inp, rec, mods = {}) {
  const i = { ...inp }, r = { ...rec, species: { ...rec.species } };
  for (const [k, v] of Object.entries(mods)) {
    if (['incl', 'alpha', 'sigma', 'Tw'].includes(k)) i[k] = String(v);
    else if (k === 'V') i.VrelOverride = String(v);
    else if (k === 'T') r.T = v;
    else if (k === 'densityFactor') { for (const s in r.species) r.species[s] *= v; if (r.rho !== undefined) r.rho *= v; }
    else if (k === 'areaFactor') scaleArea(i, v);
  }
  return runFMF(i, r);
}
export const linspace = (a, b, n) => Array.from({ length: n }, (_, k) => (n === 1 ? a : a + ((b - a) * k) / (n - 1)));

export function sweep(inp, rec, param, values) {
  return values.map((x) => ({ x, out: evalCase(inp, rec, { [param]: x }) }));
}
export function altitudeSweep(inp, records) {
  return records.map((r) => ({ x: r.alt_km, out: runFMF(inp, r) })).sort((a, b) => a.x - b.x);
}
// One-at-a-time sensitivity with USER-SUPPLIED min/max only. Not an uncertainty propagation.
export function sensitivity(inp, rec, ranges) {
  const base = runFMF(inp, rec);
  if (!base.ok) return { base, rows: [] };
  const rows = Object.entries(ranges).map(([param, { min, max }]) => {
    const lo = evalCase(inp, rec, { [param]: min }), hi = evalCase(inp, rec, { [param]: max });
    const pct = (o) => (o.ok && base.drag !== 0 ? (100 * (o.drag - base.drag)) / Math.abs(base.drag) : null);
    return { param, min, max, dMin: lo.ok ? lo.drag : null, dMax: hi.ok ? hi.drag : null, pMin: pct(lo), pMax: pct(hi), err: lo.ok && hi.ok ? '' : (lo.errors || hi.errors || []).join('; ') };
  });
  return { base, rows };
}
