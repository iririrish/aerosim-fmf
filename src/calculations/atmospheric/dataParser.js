// Importer for NRLMSISE-00 output (CSV / TSV / whitespace TXT / JSON). Never fills missing values.
export const FIELDS = [
  { key: 'alt', label: 'Altitude', kind: 'alt', required: true },
  { key: 'rho', label: 'Total mass density', kind: 'mass' },
  { key: 'T', label: 'Temperature T∞ (at altitude)', kind: 'temp', required: true },
  { key: 'Texo', label: 'Exospheric temperature', kind: 'temp' },
  { key: 'o', label: 'Atomic oxygen O', kind: 'num' },
  { key: 'o2', label: 'Molecular oxygen O2', kind: 'num' },
  { key: 'n2', label: 'Molecular nitrogen N2', kind: 'num' },
  { key: 'n', label: 'Atomic nitrogen N', kind: 'num' },
  { key: 'he', label: 'Helium He', kind: 'num' },
  { key: 'ar', label: 'Argon Ar', kind: 'num' },
  { key: 'h', label: 'Hydrogen H', kind: 'num' },
  { key: 'oanom', label: 'Anomalous oxygen', kind: 'num' },
];
export const UNITS = { alt: ['km', 'm'], mass: ['kg/m3', 'g/cm3'], num: ['m-3', 'cm-3'], temp: ['K'] };
const TO_SI = { km: 1, m: 1e-3, 'kg/m3': 1, 'g/cm3': 1e3, 'm-3': 1, 'cm-3': 1e6, K: 1 }; // altitude result in km
export const convert = (v, unit) => v * TO_SI[unit];

const ALIASES = {
  alt: ['alt', 'altitude', 'altkm', 'height'], rho: ['rho', 'd6', 'totalmassdensity', 'massdensity', 'totaldensity'],
  T: ['talt', 'tn', 'temperature', 'temp', 't'], Texo: ['texo', 'tinf', 'exotemp'],
  o: ['o', 'atomicoxygen'], o2: ['o2'], n2: ['n2'], n: ['n', 'atomicnitrogen'], he: ['he', 'helium'],
  ar: ['ar', 'argon'], h: ['h', 'hydrogen'], oanom: ['anomo', 'anomalousoxygen', 'oanom', 'oanomalous'],
};
const norm = (s) => s.toLowerCase().replace(/\(.*?\)/g, '').replace(/[^a-z0-9]/g, '');

export function parseText(text, name = '') {
  const t = text.trim();
  if (/\.json$/i.test(name) || /^[[{]/.test(t)) {
    let j = JSON.parse(t);
    if (!Array.isArray(j)) j = j.data || j.records || [j];
    const columns = [...new Set(j.flatMap((o) => Object.keys(o)))];
    return { columns, rows: j.map((o) => Object.fromEntries(columns.map((c) => [c, o[c] === undefined || o[c] === null ? NaN : Number(o[c])]))) };
  }
  const lines = t.split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !/^[#%!]/.test(l));
  if (!lines.length) throw new Error('File contains no data lines.');
  const delim = lines[0].includes(',') ? ',' : lines[0].includes('\t') ? '\t' : /\s+/;
  const split = (l) => l.split(delim).map((s) => s.trim()).filter((s) => s !== '');
  const num = (s) => Number(s.replace(/d/i, 'e'));
  const first = split(lines[0]);
  const hasHeader = first.every((s) => Number.isNaN(num(s)));
  const columns = hasHeader ? first : first.map((_, i) => `col${i + 1}`);
  const rows = lines.slice(hasHeader ? 1 : 0).map((l) => {
    const p = split(l);
    return Object.fromEntries(columns.map((c, i) => [c, p[i] === undefined ? NaN : num(p[i])]));
  });
  return { columns, rows };
}

export function guessUnit(header, kind) {
  const u = (header.match(/\(([^)]*)\)/)?.[1] ?? '').toLowerCase().replace(/\s|\^/g, '');
  if (!u) return '';
  if (kind === 'alt') return u === 'km' ? 'km' : u === 'm' ? 'm' : '';
  if (kind === 'mass') return /^kg\/m(3|³)$/.test(u) ? 'kg/m3' : /^g\/cm(3|³)$|^gm\/cm3$/.test(u) ? 'g/cm3' : '';
  if (kind === 'num') return /cm-?3|\/cm(3|³)/.test(u) ? 'cm-3' : /m-?3|\/m(3|³)/.test(u) ? 'm-3' : '';
  return u === 'k' ? 'K' : '';
}

export function autoMap(columns) {
  const mapping = {}, units = {}, used = new Set();
  for (const f of FIELDS) {
    const col = columns.find((c) => !used.has(c) && ALIASES[f.key].includes(norm(c)));
    mapping[f.key] = col ?? '';
    if (col) { used.add(col); units[f.key] = guessUnit(col, f.kind) || (f.kind === 'temp' ? 'K' : ''); }
  }
  return { mapping, units };
}

// One row -> { problems, record }. Unmapped species go to record.missing (never zero).
export function buildRecord(row, mapping, units) {
  const problems = [], rec = { species: {}, missing: [] };
  for (const f of FIELDS) {
    const col = mapping[f.key];
    if (!col) { if (f.kind === 'num') rec.missing.push(f.key); continue; }
    const unit = units[f.key];
    if (!unit) { problems.push(`${f.label}: unit not set`); continue; }
    const raw = row[col];
    if (!Number.isFinite(raw)) { problems.push(`${f.label}: value is not a number`); continue; }
    if (f.kind !== 'temp' && raw < 0) problems.push(`${f.label}: negative value`);
    const v = convert(raw, unit);
    if (f.kind === 'num') rec.species[f.key] = v; else rec[f.key === 'alt' ? 'alt_km' : f.key] = v;
  }
  if (!mapping.alt) problems.push('Altitude column is required');
  if (!mapping.T) problems.push('Temperature column is required');
  if (rec.T !== undefined && rec.T <= 0) problems.push('Temperature must be > 0 K');
  return { problems, record: rec };
}
