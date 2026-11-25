import { KB } from '../../data/constants.js';

const SQPI = Math.sqrt(Math.PI);
// erf: Maclaurin series for |x|<2.5, continued fraction for erfc beyond (double-precision accurate).
export function erf(x) {
  const a = Math.abs(x);
  let r;
  if (a < 2.5) {
    let term = a, sum = a;
    for (let k = 1; k < 80; k++) { term *= (-a * a) / k; sum += term / (2 * k + 1); }
    r = (2 / SQPI) * sum;
  } else {
    let f = a;
    for (let k = 80; k >= 1; k--) f = a + (k / 2) / f;
    r = 1 - Math.exp(-a * a) / SQPI / f;
  }
  return x < 0 ? -r : r;
}
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

// Incident Maxwellian fluxes onto a face with outward normal `nrm` (Sentman 1961; Bird 1994).
// u = bulk gas velocity relative to the surface; Sn,St = normal/tangential speed ratios.
export function incidentFluxes(n, m, T, u, nrm) {
  const c = Math.sqrt((2 * KB * T) / m), rho = n * m, un = dot(u, nrm);
  if (un >= 0 || !(n > 0)) return null;
  const Sn = -un / c, ut = u.map((x, k) => x - un * nrm[k]), utm = Math.hypot(...ut), St = utm / c;
  const e = Math.exp(-Sn * Sn), er = erf(Sn), G = e + SQPI * Sn * (1 + er);
  return {
    c, Sn, St, ut, utm,
    phi: (n * c * G) / (2 * SQPI),                                                   // number flux [1/m2/s]
    pI: rho * c * c * ((Sn * e) / (2 * SQPI) + (Sn * Sn / 2 + 0.25) * (1 + er)),     // normal momentum flux [Pa]
    tauI: (rho * c * c * St * G) / (2 * SQPI),                                       // tangential momentum flux [Pa]
    eI: (rho * c ** 3 / (4 * SQPI)) * ((Sn * Sn + St * St + 2.5) * G - 0.5 * e),     // translational energy flux [W/m2]
  };
}

// Force per unit area ON the surface for one species.
// surf: {model:'sentman', Tw, alpha} diffuse w/ incomplete energy accommodation; {model:'maxwell', Tw, sigma} sigma = diffuse fraction (fully accommodated), rest specular.
export function faceForce(n, m, T, u, nrm, surf) {
  const f = incidentFluxes(n, m, T, u, nrm);
  if (!f) return { force: [0, 0, 0], exposed: false };
  let pn, tn, Ti, Tr, pr;
  if (surf.model === 'sentman') {
    Ti = f.eI / (2 * KB * f.phi);               // 2 kB Ti * phi = E_i
    Tr = Ti + surf.alpha * (surf.Tw - Ti);      // alpha = (E_i - E_r)/(E_i - E_w)
    pr = m * f.phi * (SQPI / 2) * Math.sqrt((2 * KB * Tr) / m);
    pn = f.pI + pr;
    tn = f.tauI;
  } else if (surf.model === 'maxwell') {
    pr = m * f.phi * (SQPI / 2) * Math.sqrt((2 * KB * surf.Tw) / m);
    pn = (2 - surf.sigma) * f.pI + surf.sigma * pr;
    tn = surf.sigma * f.tauI;
  } else throw new Error(`Model "${surf.model}" is not implemented`);
  const t = f.utm > 0 ? f.ut.map((x) => x / f.utm) : [0, 0, 0];
  return { force: nrm.map((x, k) => -pn * x + tn * t[k]), exposed: true, detail: { Sn: f.Sn, St: f.St, phi: f.phi, pI: f.pI, tauI: f.tauI, eI: f.eI, Ti, Tr, pr, pn, tn } };
}
