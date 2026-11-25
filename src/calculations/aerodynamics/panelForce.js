import { faceForce } from '../gasSurface/surfaceModels.js';

// Flow frame: +x = spacecraft velocity relative to the atmosphere; gas moves with u=[-V,0,0].
// Panels: {id, area, normal:[x,y,z] (front face), faces:'front'|'both', surf}.
// No shadowing or multiple reflections between panels.
export function integratePanels(panels, comp, T, V) {
  const u = [-V, 0, 0], total = [0, 0, 0], perPanel = [];
  for (const p of panels) {
    const nl = Math.hypot(...p.normal), n = p.normal.map((x) => x / nl);
    const faces = p.faces === 'both' ? [n, n.map((x) => -x)] : [n];
    const F = [0, 0, 0];
    let exposed = false;
    for (const nrm of faces) for (const s of comp) {
      const r = faceForce(s.n, s.m, T, u, nrm, p.surf);
      exposed ||= r.exposed;
      for (let k = 0; k < 3; k++) F[k] += r.force[k] * p.area;
    }
    for (let k = 0; k < 3; k++) total[k] += F[k];
    perPanel.push({ id: p.id, area: p.area, exposed, force: F, drag: -F[0] });
  }
  return { total, drag: -total[0], lift: Math.hypot(total[1], total[2]), perPanel };
}
export const dragCoefficient = (D, rho, V, Aref) => (rho > 0 && V > 0 && Aref > 0 ? D / (0.5 * rho * V * V * Aref) : null);
export const dragAcceleration = (D, m) => D / m;
