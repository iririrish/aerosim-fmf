import { faceForce } from '../gasSurface/surfaceModels.js';
import { speciesMeanFreePaths } from '../molecular/molecular.js';
import { METHODS } from '../../data/references.js';
import { KB, MU_EARTH, R_EARTH, OMEGA_EARTH } from '../../data/constants.js';

export const sci = (x, d = 4) => {
  if (x === null || x === undefined || !Number.isFinite(x)) return '\\text{n/a}';
  if (x === 0) return '0';
  if (Math.abs(x) >= 1e4 || Math.abs(x) < 1e-3) { const [m, e] = x.toExponential(d - 1).split('e'); return `${m}\\times10^{${Number(e)}}`; }
  return String(Number(x.toPrecision(d)));
};
const L = { he: '\\mathrm{He}', o: '\\mathrm{O}', n2: '\\mathrm{N_2}', o2: '\\mathrm{O_2}', ar: '\\mathrm{Ar}', h: '\\mathrm{H}', n: '\\mathrm{N}' };
const u = (s) => `\\,\\mathrm{${s}}`;

// Every number comes from the engine result `o` (or the engine's own faceForce). kinds: user | atmosphere | derived | assumed | constant | numerical
export function buildSolutions(o, inp) {
  const out = [], sp = o.comp, T = o.T, V = o.V;
  const g = (tex, kind) => ({ tex, kind });
  const add = (id, d) => out.push({ ...METHODS[id], id, ...d });
  const row = (c, f) => f(c, L[c.key]);

  add('density', {
    given: sp.flatMap((c) => [g(`n_{${L[c.key]}}=${sci(c.n)}${u('m^{-3}')}`, 'atmosphere'), g(`m_{${L[c.key]}}=${sci(c.m)}${u('kg')}`, 'derived')]),
    substitution: `\\rho=${sp.map((c) => `(${sci(c.n)})(${sci(c.m)})`).join('+')}`,
    steps: sp.map((c) => `\\rho_{${L[c.key]}}=n m=${sci(c.n * c.m)}${u('kg/m^3')}`),
    answer: `\\rho=${sci(o.rhoSum)}${u('kg/m^3')}`,
    interpretation: o.rho !== undefined ? `Uploaded total density is ${sci(o.rho)} kg/m³; the species sum differs by ${(100 * Math.abs(o.rho - o.rhoSum) / o.rho).toFixed(1)} %.` : 'The file has no total density to compare against.',
  });
  add('vmp', {
    given: [g(`T_\\infty=${sci(T)}${u('K')}`, 'atmosphere'), g(`k_B=${sci(KB)}${u('J/K')}`, 'constant')],
    substitution: sp.map((c) => `v_{mp,${L[c.key]}}=\\sqrt{2(${sci(KB)})(${sci(T)})/(${sci(c.m)})}`).join(',\\;'),
    steps: o.species.map((s) => `v_{mp,${L[s.key]}}=${sci(s.vmp)}${u('m/s')}`),
    answer: o.species.map((s) => `v_{mp,${L[s.key]}}=${sci(s.vmp)}`).join(',\\;') + u('m/s'),
    interpretation: 'Lighter species move faster thermally; this sets how hyperthermal each species looks to the spacecraft.',
  });
  const r = (R_EARTH + o.altKm * 1e3);
  add('velocity', {
    given: [g(`h=${sci(o.altKm)}${u('km')}`, 'atmosphere'), g(`i=${inp.orbInc}^\\circ,\\; u=${inp.argLat}^\\circ`, 'user'), g(`\\mu=${sci(MU_EARTH)}${u('m^3/s^2')},\\;R_E=${sci(R_EARTH)}${u('m')},\\;\\omega_E=${sci(OMEGA_EARTH)}${u('rad/s')}`, 'constant'),
      g(inp.corot ? '\\text{co-rotation on}' : '\\text{co-rotation off}', 'user'), g(`\\vec w=(${inp.wE || 0},${inp.wN || 0},${inp.wU || 0})${u('m/s')}`, inp.wE || inp.wN || inp.wU ? 'user' : 'assumed')],
    substitution: `v=\\sqrt{${sci(MU_EARTH)}/${sci(r)}}`,
    steps: [`r=R_E+h=${sci(r)}${u('m')}`, `v=${sci(o.vel.vOrbital)}${u('m/s')}`, `|\\omega_E\\times r|=${sci(o.vel.vCorot)}${u('m/s')}\\;(\\text{inertial magnitude, vector-subtracted})`],
    answer: `V=${sci(V)}${u('m/s')}`,
    interpretation: `The relative speed is ${sci(V)} m/s, versus ${sci(o.vel.vOrbital)} m/s inertial. The two differ because the atmosphere moves with Earth.`,
  });
  add('speed', {
    given: [g(`V=${sci(V)}${u('m/s')}`, 'derived')],
    substitution: o.species.map((s) => `S_{${L[s.key]}}=${sci(V)}/${sci(s.vmp)}`).join(',\\;'),
    steps: o.species.map((s) => `S_{${L[s.key]}}=${sci(s.S)}`),
    answer: o.species.map((s) => `S_{${L[s.key]}}=${sci(s.S, 3)}`).join(',\\;'),
    interpretation: `S ≫ 1 (${sci(Math.min(...o.species.map((s) => s.S)), 3)} to ${sci(Math.max(...o.species.map((s) => s.S)), 3)}) means the flow is strongly directed; light species (small S) are the least hyperthermal.`,
  });
  const li = speciesMeanFreePaths(sp), nTot = sp.reduce((s, c) => s + c.n, 0);
  add('mfp', {
    given: sp.flatMap((c) => [g(`d_{${L[c.key]}}=${sci(c.d)}${u('m')}`, c.dSource === 'placeholder' ? 'assumed' : 'constant')]).concat(g(`n=\\sum n_i=${sci(nTot)}${u('m^{-3}')}`, 'derived')),
    substitution: '\\lambda_i=\\left[\\sum_j n_j\\pi d_{ij}^2\\sqrt{1+m_i/m_j}\\right]^{-1}\\;\\text{evaluated for every } (i,j)',
    steps: sp.map((c, k) => `\\lambda_{${L[c.key]}}=${sci(li[k])}${u('m')}`).concat(`\\lambda=\\sum_i (n_i/n)\\lambda_i=${sci(o.lambda)}${u('m')}`),
    answer: `\\lambda=${sci(o.lambda)}${u('m')}`,
    interpretation: `A molecule travels about ${sci(o.lambda / 1e3, 3)} km between collisions.${sp.some((c) => c.dSource === 'placeholder') ? ' Diameters of O/N/H are placeholders, so treat this value as provisional.' : ''}`,
  });
  add('kn', {
    given: [g(`\\lambda=${sci(o.lambda)}${u('m')}`, 'derived'), g(`L_c=${sci(o.Lc)}${u('m')}`, inp.Lc === '' ? 'derived' : 'user')],
    substitution: `Kn=${sci(o.lambda)}/${sci(o.Lc)}`, steps: [`Kn=${sci(o.Kn)}`],
    answer: `Kn=${sci(o.Kn)}\\;(\\text{${o.regime}})`,
    interpretation: o.regime === 'free molecular' ? 'Kn > 10: collisions between gas molecules near the sail are negligible, so the free-molecular formulation applies.' : `The regime is ${o.regime}. Pure free-molecular results are exploratory only.`,
  });

  // Worked face: first exposed face of first exposed panel.
  const uVec = [-V, 0, 0]; let face = null;
  for (const p of o.panelDefs) {
    const nl = Math.hypot(...p.normal), n = p.normal.map((x) => x / nl);
    for (const nrm of p.faces === 'both' ? [n, n.map((x) => -x)] : [n]) if (!face && faceForce(sp[0].n, sp[0].m, T, uVec, nrm, p.surf).exposed) face = { p, nrm };
  }
  if (face) {
    const { p, nrm } = face, ex = sp.map((c) => ({ c, d: faceForce(c.n, c.m, T, uVec, nrm, p.surf).detail }));
    const nv = `\\hat n=(${nrm.map((x) => sci(x, 3)).join(',')})`;
    add('incident', {
      given: [g(`\\text{panel } ${p.id},\\; ${nv}`, 'user'), g(`\\vec u=(${sci(-V)},0,0)${u('m/s')}`, 'derived'), g(`T_\\infty=${sci(T)}${u('K')}`, 'atmosphere')],
      substitution: 'S_n=-\\vec u\\cdot\\hat n/v_{mp}\\;\\text{then } G,\\Phi,p_i,\\tau_i,E_i\\text{ for each species}',
      steps: ex.map(({ c, d }) => `\\begin{aligned}&${L[c.key]}:\\; S_n=${sci(d.Sn)},\\;S_t=${sci(d.St)}\\\\&\\Phi=${sci(d.phi)}${u('m^{-2}s^{-1}')},\\;p_i=${sci(d.pI)}${u('Pa')},\\;\\tau_i=${sci(d.tauI)}${u('Pa')},\\;E_i=${sci(d.eI)}${u('W/m^2')}\\end{aligned}`),
      answer: `p_{i,tot}=${sci(ex.reduce((s, e) => s + e.d.pI, 0))}${u('Pa')}`,
      interpretation: 'Incident normal pressure is dominated by the species with the largest mass density; this is the momentum delivered before re-emission.',
    });
    const sen = p.surf.model === 'sentman';
    add(sen ? 'sentman' : 'maxwell', {
      given: [g(`T_w=${sci(p.surf.Tw)}${u('K')}`, 'user'), g(sen ? `\\alpha=${sci(p.surf.alpha)}` : `\\sigma=${sci(p.surf.sigma)}`, 'user')],
      substitution: sen ? 'T_r=T_i+\\alpha(T_w-T_i)' : 'p=(2-\\sigma)p_i+\\sigma p_r(T_w)',
      steps: ex.map(({ c, d }) => sen
        ? `\\begin{aligned}&${L[c.key]}:\\;T_i=${sci(d.Ti)}${u('K')},\\;T_r=${sci(d.Tr)}${u('K')}\\\\&p_r=${sci(d.pr)},\\;p_n=p_i+p_r=${sci(d.pn)}${u('Pa')},\\;\\tau=${sci(d.tn)}${u('Pa')}\\end{aligned}`
        : `\\begin{aligned}&${L[c.key]}:\\;p_r=${sci(d.pr)},\\;p=${sci(d.pn)}${u('Pa')},\\;\\tau=${sci(d.tn)}${u('Pa')}\\end{aligned}`),
      answer: `p_{n,tot}=${sci(ex.reduce((s, e) => s + e.d.pn, 0))}${u('Pa')}`,
      interpretation: sen ? `Re-emitted molecules leave at T_r, between the incident and wall temperatures; a higher α pulls T_r toward T_w and lowers p_r.` : 'Specular molecules return the full incident normal momentum (factor 2); the diffuse part adds re-emission pressure at T_w.',
    });
  }
  const F = o.force;
  add('force', {
    given: o.panels.map((p) => g(`\\text{${p.id}}:\\;A=${sci(p.area)}${u('m^2')},\\;\\text{${p.exposed ? 'exposed' : 'not exposed'}}`, 'user')),
    substitution: '\\vec F=\\sum \\vec f\\,A,\\quad D=-F_x',
    steps: o.panels.map((p) => `\\vec F_{\\text{${p.id}}}=(${p.force.map((x) => sci(x)).join(',')})${u('N')}`).concat(`\\vec F=(${F.map((x) => sci(x)).join(',')})${u('N')}`),
    answer: `D=${sci(o.drag)}${u('N')},\\; L=${sci(o.lift)}${u('N')}`,
    interpretation: o.drag > 0 ? 'Positive D means the gas pushes the spacecraft opposite to its motion. Non-zero L comes from an inclined plate with a tangential force component.' : 'D ≤ 0: no net retarding force from the exposed faces.',
    assumptions: o.assumptions,
  });
  add('cd', {
    given: [g(`D=${sci(o.drag)}${u('N')}`, 'derived'), g(`\\rho=${sci(o.rhoSum)}${u('kg/m^3')}`, 'derived'), g(`V=${sci(V)}${u('m/s')}`, 'derived'), g(`A_{ref}=${sci(o.Aref)}${u('m^2')}`, inp.Aref === '' ? 'derived' : 'user')],
    substitution: `C_D=${sci(o.drag)}/(0.5\\cdot${sci(o.rhoSum)}\\cdot(${sci(V)})^2\\cdot${sci(o.Aref)})`, steps: [`q=\\tfrac12\\rho V^2=${sci(0.5 * o.rhoSum * V * V)}${u('Pa')}`],
    answer: `C_D=${sci(o.Cd)}`, interpretation: 'Cd is tied to this A_ref and force direction; it comes from the momentum calculation, not from an assumed constant.',
  });
  add('accel', {
    given: [g(`D=${sci(o.drag)}${u('N')}`, 'derived'), g(`m=${sci(o.mass)}${u('kg')}`, 'user')],
    substitution: `a_D=${sci(o.drag)}/${sci(o.mass)}`, steps: [], answer: `a_D=${sci(o.accel)}${u('m/s^2')}`,
    interpretation: 'Instantaneous deceleration at this altitude and attitude; it is not an orbit-decay or lifetime result.',
  });
  return out;
}
