import { composition, massDensity, meanFreePath, classifyKn, relativeVelocity, mostProbableSpeed, DEFAULT_REGIMES } from './molecular/molecular.js';
import { integratePanels, dragCoefficient, dragAcceleration } from './aerodynamics/panelForce.js';

// inp: raw form strings. rec: selected atmospheric record (SI). Returns {ok, errors, warnings, assumptions, ...results}.
export function runFMF(inp, rec) {
  const errors = [], warnings = [], assumptions = [];
  const num = (k, label, { pos = false, nonneg = false, max = Infinity } = {}) => {
    const v = inp[k] === '' || inp[k] === undefined ? NaN : Number(inp[k]);
    if (!Number.isFinite(v)) errors.push(`${label} is required`);
    else if ((pos && v <= 0) || (nonneg && v < 0) || v > max) errors.push(`${label} is out of range`);
    return v;
  };
  if (!rec) return { ok: false, errors: ['No atmospheric record selected (Atmospheric data page).'], warnings, assumptions };
  if (rec.alt_km === undefined || rec.T === undefined) errors.push('Selected record lacks altitude or temperature');
  const comp = composition(rec, inp.anom);
  if (!comp.length) errors.push('Selected record has no species number densities');
  const miss = (rec.missing ?? []).filter((k) => k !== 'oanom');
  if ((rec.missing ?? []).includes('oanom')) warnings.push('Anomalous oxygen not in the file; it is not included (negligible below ~500 km, but not assumed zero).');
  if (miss.length && !inp.allowMissing) errors.push(`Missing species densities (${miss.join(', ')}). Tick "continue without missing species" to proceed knowingly.`);
  else if (miss.length) warnings.push(`Species excluded because absent from the data: ${miss.join(', ')}. They are NOT treated as measured zero.`);

  const mass = num('massKg', 'Spacecraft mass', { pos: true });
  const incl = num('incl', 'Sail inclination', { max: 180 }), orient = num('orient', 'Sail orientation');
  const Tw = num('Tw', 'Surface temperature', { pos: true });
  const orbInc = num('orbInc', 'Orbit inclination', { nonneg: true, max: 180 }), argLat = num('argLat', 'Argument of latitude');
  const surf = { model: inp.model, Tw };
  if (inp.model === 'sentman') surf.alpha = num('alpha', 'Energy accommodation coefficient α', { nonneg: true, max: 1 });
  else surf.sigma = num('sigma', 'Diffuse fraction σ', { nonneg: true, max: 1 });

  let panels = [], Lcauto = NaN;
  const g = inp.geometry, D2R = Math.PI / 180;
  if (g === 'custom') {
    try {
      panels = JSON.parse(inp.panelsJson).map((p, i) => ({ id: p.id ?? `P${i + 1}`, area: Number(p.area), normal: p.normal, faces: p.faces ?? 'front',
        surf: { model: p.model ?? inp.model, Tw: p.Tw ?? Tw, alpha: p.alpha ?? surf.alpha, sigma: p.sigma ?? surf.sigma } }));
      if (!panels.length || panels.some((p) => !(p.area > 0) || !Array.isArray(p.normal) || p.normal.length !== 3 || !(Math.hypot(...p.normal) > 0))) throw new Error();
    } catch { errors.push('Custom panels: provide a JSON array of {area>0, normal:[x,y,z]} (flow frame: +x = velocity direction)'); }
  } else {
    let area = NaN;
    if (g === 'circle') { const d = num('D', 'Diameter', { pos: true }); area = Math.PI * d * d / 4; Lcauto = d; }
    else if (g === 'square') { const l = num('L', 'Side length', { pos: true }); area = l * l; Lcauto = l; }
    else { const l = num('L', 'Length', { pos: true }), w = num('W', 'Width', { pos: true }); area = l * w; Lcauto = Math.max(l, w); }
    const th = incl * D2R, ph = orient * D2R;
    panels = [{ id: 'sail', area, normal: [Math.cos(th), Math.sin(th) * Math.cos(ph), Math.sin(th) * Math.sin(ph)], faces: inp.both ? 'both' : 'front', surf }];
  }
  const Lc = inp.Lc === '' ? Lcauto : num('Lc', 'Characteristic length', { pos: true });
  if (!Number.isFinite(Lc) && g === 'custom') errors.push('Characteristic length is required for custom panels');
  const areaSum = panels.reduce((s, p) => s + p.area, 0);
  const Aref = inp.Aref === '' ? areaSum : num('Aref', 'Reference area', { pos: true });
  const wind = ['wE', 'wN', 'wU'].map((k) => Number(inp[k] || 0));
  if (errors.length) return { ok: false, errors, warnings, assumptions };

  const T = rec.T, hKm = rec.alt_km;
  const rhoSum = massDensity(comp), lambda = meanFreePath(comp), Kn = lambda / Lc;
  const regime = classifyKn(Kn, DEFAULT_REGIMES);
  const vel = relativeVelocity({ hKm, incDeg: orbInc, argLatDeg: argLat, corot: inp.corot, wind });
  const V = inp.VrelOverride ? Number(inp.VrelOverride) : vel.V;
  if (inp.VrelOverride) assumptions.push(`Relative speed overridden to ${V} m/s (sensitivity case).`);
  if (regime !== 'free molecular') warnings.push(`Kn = ${Kn.toExponential(3)} is ${regime}: a pure free-molecular calculation may not represent this regime. Result is exploratory only.`);
  if (rec.rho !== undefined && rhoSum > 0 && Math.abs(rec.rho - rhoSum) / rec.rho > 0.05)
    warnings.push(`Σ n_i m_i = ${rhoSum.toExponential(3)} kg/m³ differs from the uploaded ρ = ${rec.rho.toExponential(3)} by ${(100 * Math.abs(rec.rho - rhoSum) / rec.rho).toFixed(1)} %. Check anomalous-oxygen handling and missing species.`);
  const ph = comp.filter((c) => c.dSource === 'placeholder').map((c) => c.key.toUpperCase());
  if (ph.length) warnings.push(`Collision diameters for ${ph.join(', ')} are unsourced placeholders (3.0e-10 m). The mean free path and Kn depend on them; replace with a cited value.`);
  if (!inp.corot) assumptions.push('Atmosphere is not co-rotating (user choice).'); else assumptions.push('Atmosphere rigidly co-rotates with Earth (ω = 7.2921159e-5 rad/s).');
  if (wind.every((w) => w === 0)) assumptions.push('Wind relative to the co-rotating atmosphere = 0 (user did not enter wind).');
  assumptions.push('Circular orbit at the record altitude. Gas is a Maxwellian at T∞ with bulk velocity from the relative velocity.', 'Translational energy only; no internal-energy exchange, no panel shadowing or multiple reflections, no adsorption/desorption chemistry.', 'Collision diameters are VHS reference values at 273 K, used as hard-sphere diameters.');

  const f = integratePanels(panels, comp, T, V);
  if (!panels.some((_, i) => f.perPanel[i].exposed)) warnings.push('No panel face is exposed to the flow; forces are zero.');
  const Cd = dragCoefficient(f.drag, rhoSum, V, Aref);
  return {
    ok: true, errors, warnings, assumptions, comp, panelDefs: panels, altKm: hKm, T, rho: rec.rho, rhoSum, lambda, Lc, Kn, regime, vel, V, Aref, areaSum,
    species: comp.map((c) => ({ key: c.key, n: c.n, m: c.m, vmp: mostProbableSpeed(T, c.m), S: V / mostProbableSpeed(T, c.m) })),
    panels: f.perPanel, force: f.total, drag: f.drag, lift: f.lift, Cd, accel: dragAcceleration(f.drag, mass), accelDir: vel.dir.map((x) => -x), mass,
  };
}
