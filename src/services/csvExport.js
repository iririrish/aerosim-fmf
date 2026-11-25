export function download(name, text, mime = 'text/plain') {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: mime }));
  a.download = name; a.click(); URL.revokeObjectURL(a.href);
}
const q = (v) => { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
export const toCSV = (rows) => rows.map((r) => r.map(q).join(',')).join('\n');
export function resultRows(o) {
  return [['quantity', 'value', 'unit'], ['altitude', o.altKm, 'km'], ['T_inf', o.T, 'K'], ['density_sum_n_m', o.rhoSum, 'kg/m3'], ['density_uploaded', o.rho, 'kg/m3'],
    ['mean_free_path', o.lambda, 'm'], ['characteristic_length', o.Lc, 'm'], ['Knudsen', o.Kn, ''], ['regime', o.regime, ''], ['relative_velocity', o.V, 'm/s'],
    ['Fx', o.force[0], 'N'], ['Fy', o.force[1], 'N'], ['Fz', o.force[2], 'N'], ['drag', o.drag, 'N'], ['lift_side', o.lift, 'N'], ['reference_area', o.Aref, 'm2'],
    ['Cd', o.Cd, ''], ['mass', o.mass, 'kg'], ['drag_acceleration', o.accel, 'm/s2']];
}
