// Validation suite. Groups: units, analytical, limiting, convergence, invariance, regression.
import { erf, incidentFluxes } from '../gasSurface/surfaceModels.js';
import { composition, meanFreePath, relativeVelocity, mostProbableSpeed, classifyKn } from '../molecular/molecular.js';
import { integratePanels, dragCoefficient, dragAcceleration } from '../aerodynamics/panelForce.js';
import { convert } from '../atmospheric/dataParser.js';
import { runFMF } from '../engine.js';
import { KB, AMU, speciesMass } from '../../data/constants.js';
import GOLD from './golden.js';

const close = (a, b, tol) => Math.abs(a - b) <= tol * Math.max(Math.abs(a), Math.abs(b), 1e-300);
const MO = 15.9994 * AMU;

function simpson(f, a, b, N) {
  const h = (b - a) / N; let s = 0;
  for (let i = 0; i <= N; i++) s += (i === 0 || i === N ? 1 : i % 2 ? 4 : 2) * f(a + i * h);
  return (s * h) / 3;
}
// Brute-force Maxwellian moments over the normal velocity (tangential moments are Gaussian-analytic).
function quad(n, m, T, V, th, N) {
  const c = Math.sqrt((2 * KB * T) / m), un = V * Math.cos(th), ut2 = V * V - un * un;
  const g = (cn) => (n * Math.exp(-((cn - un) ** 2) / (c * c))) / (Math.sqrt(Math.PI) * c);
  const hi = un + 12 * c;
  return { phi: simpson((x) => g(x) * x, 0, hi, N), p: simpson((x) => g(x) * m * x * x, 0, hi, N), e: simpson((x) => g(x) * 0.5 * m * x * (x * x + ut2 + c * c), 0, hi, N) };
}

export const REG_RECORD = { alt_km: 300, T: 1000, rho: 2.5e-11, species: { o: 3e15, o2: 2e13, n2: 2e14, he: 1e12, ar: 1e9, h: 1e11, n: 1e12 }, missing: ['oanom'] };
const base = { massKg: '10', geometry: 'rect', L: '2', W: '1', D: '', panelsJson: '', incl: '30', orient: '0', both: true, Lc: '', Aref: '', Tw: '300', model: 'sentman', alpha: '0.9', sigma: '0.5', orbInc: '51.6', argLat: '30', corot: true, wE: '', wN: '', wU: '', anom: 'add', allowMissing: false };
export const REG_CASES = { sentmanRect: base, maxwellCircle: { ...base, model: 'maxwell', geometry: 'circle', D: '1.5', incl: '0', sigma: '0.3' } };

export function runValidation() {
  const R = [], t = (group, name, cond, info = '') => R.push({ group, name, pass: !!cond, info: String(info) });
  const panel = (surf, nrm, n = 1e15, T = 1000, V = 7800, faces = 'front') => integratePanels([{ id: 'p', area: 2, normal: nrm, faces, surf }], [{ key: 'o', n, m: MO, d: 3e-10 }], T, V);

  t('units', 'g/cm³ → kg/m³ ×1000', convert(1, 'g/cm3') === 1000); t('units', 'cm⁻³ → m⁻³ ×1e6', convert(1, 'cm-3') === 1e6); t('units', 'm → km ×1e-3', convert(1500, 'm') === 1.5);
  t('units', 'O₂ mass = 31.9988 u', close(speciesMass('o2'), 31.9988 * AMU, 1e-15));
  t('units', 'v_mp(O, 1000 K) = √(2kT/m)', close(mostProbableSpeed(1000, MO), Math.sqrt((2 * 1.380649e-23 * 1000) / (15.9994 * 1.66053906660e-27)), 1e-14), mostProbableSpeed(1000, MO).toFixed(2) + ' m/s');
  t('units', 'λ(single species) = 1/(√2 π d² n)', close(meanFreePath([{ n: 1e15, m: MO, d: 3e-10 }]), 1 / (Math.SQRT2 * Math.PI * 9e-20 * 1e15), 1e-12));
  t('units', 'λ unchanged when one species is split in two identical halves', close(meanFreePath([{ n: 5e14, m: MO, d: 3e-10 }, { n: 5e14, m: MO, d: 3e-10 }]), meanFreePath([{ n: 1e15, m: MO, d: 3e-10 }]), 1e-12));
  t('units', 'Kn regimes (0.0005, 0.05, 5, 50)', ['continuum', 'slip', 'transitional', 'free molecular'].every((r, i) => classifyKn([5e-4, 0.05, 5, 50][i]) === r));
  t('units', 'a = D/m', dragAcceleration(6, 3) === 2); t('units', 'Cd undefined at zero density', dragCoefficient(1, 0, 7800, 1) === null);
  t('units', 'circular orbit speed at 400 km ≈ 7668.6 m/s', Math.abs(relativeVelocity({ hKm: 400, incDeg: 51.6, argLatDeg: 0, corot: false }).V - 7668.6) < 5);
  t('units', 'co-rotation lowers equatorial prograde relative speed', relativeVelocity({ hKm: 400, incDeg: 0, argLatDeg: 0, corot: true }).V < relativeVelocity({ hKm: 400, incDeg: 0, argLatDeg: 0, corot: false }).V);

  t('analytical', 'erf(0.5), erf(3), erf odd', close(erf(0.5), 0.5204998778130465, 1e-12) && close(erf(3), 0.9999779095030014, 1e-12) && close(erf(-1.2), -0.9103139782296354, 1e-12));
  for (const [V, th] of [[7500, 0], [7500, 60], [3000, 80], [500, 20]]) {
    const th_ = (th * Math.PI) / 180, f = incidentFluxes(1e15, MO, 1000, [-V, 0, 0], [Math.cos(th_), Math.sin(th_), 0]), q = quad(1e15, MO, 1000, V, th_, 400000);
    t('analytical', `closed-form Φ, p_i, E_i vs quadrature (V=${V}, θ=${th}°)`, close(f.phi, q.phi, 1e-6) && close(f.pI, q.p, 1e-6) && close(f.eI, q.e, 1e-6));
  }
  for (const th of [0, 30, 60]) {
    const r = (th * Math.PI) / 180, n = [Math.cos(r), Math.sin(r), 0], rho = 1e15 * MO;
    const spec = dragCoefficient(panel({ model: 'maxwell', Tw: 1, sigma: 0 }, n, 1e15, 1, 7800).drag, rho, 7800, 2);
    const dif = dragCoefficient(panel({ model: 'sentman', Tw: 1, alpha: 1 }, n, 1e15, 1, 7800).drag, rho, 7800, 2);
    t('analytical', `hyperthermal specular Cd = 4cos³θ (θ=${th}°)`, close(spec, 4 * Math.cos(r) ** 3, 2e-3), spec.toFixed(4));
    t('analytical', `hyperthermal cold-wall diffuse Cd = 2cosθ (θ=${th}°)`, close(dif, 2 * Math.cos(r), 1e-2), dif.toFixed(4));
  }

  const rho = 1e15 * MO, S = { model: 'sentman', Tw: 300, alpha: 0.8 };
  t('limiting', 'zero relative velocity → zero force', panel(S, [1, 0, 0], 1e15, 1000, 0).drag === 0);
  t('limiting', 'zero density → zero force', panel(S, [1, 0, 0], 0).drag === 0);
  t('limiting', 'zero area → zero force', integratePanels([{ id: 'p', area: 0, normal: [1, 0, 0], faces: 'front', surf: S }], [{ key: 'o', n: 1e15, m: MO, d: 3e-10 }], 1000, 7800).drag === 0);
  t('limiting', 'face turned away from flow is unexposed', panel(S, [-1, 0, 0]).drag === 0);
  t('limiting', 'back face adds nothing when unexposed', close(panel(S, [1, 0, 0], 1e15, 1000, 7800, 'both').drag, panel(S, [1, 0, 0]).drag, 1e-12));
  t('limiting', 'Maxwell σ=1 equals Sentman α=1', close(panel({ model: 'maxwell', Tw: 300, sigma: 1 }, [1, 0, 0]).drag, panel({ model: 'sentman', Tw: 300, alpha: 1 }, [1, 0, 0]).drag, 1e-12));
  t('limiting', 'specular edge-on drag = 0', Math.abs(panel({ model: 'maxwell', Tw: 300, sigma: 0 }, [0, 1, 0]).drag) < 1e-9 * rho * 7800 ** 2 * 2);
  t('limiting', 'specular plate: drag ≥ 0 for all inclinations', [0, 15, 30, 45, 60, 75, 89].every((a) => panel({ model: 'maxwell', Tw: 300, sigma: 0 }, [Math.cos((a * Math.PI) / 180), Math.sin((a * Math.PI) / 180), 0]).drag >= 0));
  t('limiting', 'higher accommodation α changes drag monotonically (cold wall)', panel({ model: 'sentman', Tw: 300, alpha: 0 }, [1, 0, 0]).drag > panel({ model: 'sentman', Tw: 300, alpha: 1 }, [1, 0, 0]).drag);

  const ref = incidentFluxes(1e15, MO, 1000, [-7500, 0, 0], [Math.cos(0.5), Math.sin(0.5), 0]), exact = quad(1e15, MO, 1000, 7500, 0.5, 2000000).p;
  const errs = [100, 1000, 10000, 100000].map((N) => Math.abs(quad(1e15, MO, 1000, 7500, 0.5, N).p - exact) / exact);
  t('convergence', 'Simpson error decreases with resolution (N=1e2…1e5)', errs.every((e, i) => i === 0 || e <= errs[i - 1] || e < 1e-13), errs.map((e) => e.toExponential(1)).join(' → '));
  t('convergence', 'converged quadrature matches closed form < 1e-9', close(ref.pI, exact, 1e-9));

  const nrm = (th, ph) => [Math.cos(th), Math.sin(th) * Math.cos(ph), Math.sin(th) * Math.sin(ph)];
  t('invariance', 'drag invariant to rotation of the normal about the velocity axis', close(panel(S, nrm(0.7, 0)).drag, panel(S, nrm(0.7, 1.3)).drag, 1e-12));
  t('invariance', 'lift magnitude invariant to that rotation', close(panel(S, nrm(0.7, 0)).lift, panel(S, nrm(0.7, 2.1)).lift, 1e-12));

  for (const [k, inp] of Object.entries(REG_CASES)) {
    const o = runFMF(inp, REG_RECORD), g = GOLD[k];
    t('regression', `${k}: Kn, V, drag, Cd, a_D unchanged (1e-9)`, g && o.ok && ['Kn', 'V', 'drag', 'Cd', 'accel'].every((q) => close(o[q], g[q], 1e-9)), g ? '' : 'golden values missing');
  }
  return R;
}
