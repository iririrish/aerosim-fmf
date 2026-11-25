// Relative difference of FMF vs externally imported DSMC. Zero reference handled safely (returns null).
export const relativeError = (fmf, dsmc) => (!Number.isFinite(fmf) || !Number.isFinite(dsmc) || dsmc === 0 ? null : (Math.abs(fmf - dsmc) / Math.abs(dsmc)) * 100);

export function compareDSMC(dsmcData, fmfRows, tolKm = 0.5) {
  const col = (re, not) => dsmcData.columns.find((c) => re.test(c) && !(not && not.test(c)));
  const a = col(/alt|height/i), d = col(/drag|force/i, /coef|cd/i), cd = col(/^cd|coef/i);
  if (!a || (!d && !cd)) return { error: 'DSMC file needs an altitude column and a drag-force and/or Cd column (header names containing "alt", "drag", "Cd").', rows: [] };
  const rows = [];
  for (const r of dsmcData.rows) {
    const m = fmfRows.filter((f) => f.out.ok).find((f) => Math.abs(f.x - r[a]) <= tolKm);
    if (!m) continue;
    rows.push({ alt: r[a], fmfDrag: m.out.drag, dsmcDrag: d ? r[d] : null, errDrag: d ? relativeError(m.out.drag, r[d]) : null,
      fmfCd: m.out.Cd, dsmcCd: cd ? r[cd] : null, errCd: cd ? relativeError(m.out.Cd, r[cd]) : null });
  }
  return { rows, error: rows.length ? '' : 'No DSMC altitude matches an atmospheric-dataset record (tolerance 0.5 km).' };
}
