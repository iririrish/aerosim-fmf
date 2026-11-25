import { useState } from 'react';
import WarningPanel from '../components/WarningPanel.jsx';
import { FIELDS, UNITS, parseText, autoMap, buildRecord } from '../calculations/atmospheric/dataParser.js';
import { load, save } from '../services/localStorage.js';
import { formatValue } from '../utils/formatting.js';

export default function AtmosphericData() {
  const [src, setSrc] = useState(null);       // {name,text}
  const [data, setData] = useState(null);     // {columns, rows}
  const [map, setMap] = useState({});
  const [units, setUnits] = useState({});
  const [sel, setSel] = useState(0);
  const [err, setErr] = useState('');
  const [saved, setSaved] = useState(load('atmosphere.selected', null));
  const [pasted, setPasted] = useState('');

  const ingest = (name, text) => {
    try {
      const d = parseText(text, name);
      const a = autoMap(d.columns);
      setSrc({ name, text }); setData(d); setMap(a.mapping); setUnits(a.units); setSel(0); setErr('');
      // original file preserved untouched
      if (!save('atmosphere.original', { name, text })) setErr('Original file too large to keep in browser storage; parsed data is still usable.');
    } catch (e) { setErr(`Could not parse input: ${e.message}`); }
  };
  const onFile = async (e) => { const f = e.target.files[0]; if (f) ingest(f.name, await f.text()); };

  const built = data ? data.rows.map((r) => buildRecord(r, map, units)) : [];
  const cur = built[sel];
  const use = () => {
    const s = { record: cur.record, source: src.name, row: sel };
    save('atmosphere.selected', s); setSaved(s);
    save('atmosphere.dataset', { source: src.name, records: built.filter((b) => !b.problems.length).map((b) => b.record).slice(0, 3000) });
  };
  const colsWith = (kind) => data.columns;

  return (
    <>
      <WarningPanel kind="info" title="Import only">
        This page reads output you generated with NRLMSISE-00 elsewhere. DragSail does not run NRLMSISE-00.
        Use comma/tab-separated columns (or whitespace if headers contain no spaces). Units must be stated for every mapped column.
      </WarningPanel>
      <div className="card">
        <h2>1. Load data</h2>
        <input type="file" accept=".csv,.txt,.json,.dat" onChange={onFile} aria-label="Upload atmospheric file" />
        <details><summary>Or paste / type data</summary>
          <textarea rows={5} value={pasted} onChange={(e) => setPasted(e.target.value)} placeholder={'alt(km),rho(g/cm3),Talt(K),O(cm-3),N2(cm-3)\n400,2.9e-15,950,1e8,1e7'} />
          <button onClick={() => ingest('pasted.csv', pasted)}>Parse pasted data</button>
        </details>
        {err && <WarningPanel kind="error">{err}</WarningPanel>}
      </div>

      {data && (<>
        <div className="card">
          <h2>2. Map columns and confirm units</h2>
          <table><thead><tr><th>Quantity</th><th>Column</th><th>Unit</th></tr></thead><tbody>
            {FIELDS.map((f) => (
              <tr key={f.key}>
                <td>{f.label}{f.required && ' *'}</td>
                <td><select value={map[f.key] ?? ''} onChange={(e) => setMap({ ...map, [f.key]: e.target.value })}>
                  <option value="">— not in file —</option>{colsWith(f.kind).map((c) => <option key={c}>{c}</option>)}</select></td>
                <td>{map[f.key] ? <select value={units[f.key] ?? ''} onChange={(e) => setUnits({ ...units, [f.key]: e.target.value })}>
                  <option value="">choose unit…</option>{UNITS[f.kind].map((u) => <option key={u}>{u}</option>)}</select> : '—'}</td>
              </tr>))}
          </tbody></table>
          {cur?.record.missing.length > 0 && <WarningPanel kind="warn" title="Species not in file">
            {cur.record.missing.join(', ')} — these are reported as missing, never set to zero.</WarningPanel>}
        </div>

        <div className="card">
          <h2>3. Choose the record ({data.rows.length} rows)</h2>
          <div className="scroll"><table><thead><tr><th></th><th>#</th><th>Alt (km)</th><th>T (K)</th><th>ρ (kg/m³)</th>
            {['o', 'o2', 'n2', 'n', 'he', 'ar', 'h', 'oanom'].map((k) => <th key={k}>{k} (m⁻³)</th>)}<th>Status</th></tr></thead><tbody>
            {built.slice(0, 200).map(({ record: r, problems }, i) => (
              <tr key={i}><td><input type="radio" name="row" checked={sel === i} onChange={() => setSel(i)} aria-label={`Select row ${i + 1}`} /></td>
                <td>{i + 1}</td><td>{formatValue(r.alt_km)}</td><td>{formatValue(r.T)}</td><td>{formatValue(r.rho)}</td>
                {['o', 'o2', 'n2', 'n', 'he', 'ar', 'h', 'oanom'].map((k) => <td key={k}>{formatValue(r.species[k])}</td>)}
                <td>{problems.length ? <span className="tag planned" title={problems.join('; ')}>{problems.length} issue(s)</span> : <span className="tag implemented">ok</span>}</td></tr>))}
          </tbody></table></div>
          {cur?.problems.length > 0 && <WarningPanel kind="error" title="Selected row has problems">{cur.problems.join('; ')}</WarningPanel>}
          <button disabled={!cur || cur.problems.length > 0} onClick={use}>Use this record in the calculator</button>
        </div>
      </>)}

      <div className="card"><h2>Active record</h2>
        {saved ? <p>Row {saved.row + 1} of <code>{saved.source}</code>: altitude {formatValue(saved.record.alt_km)} km, T = {formatValue(saved.record.T)} K.
          Species present: {Object.keys(saved.record.species).join(', ') || 'none'}.</p> : <p className="empty">No record selected yet.</p>}
      </div>
    </>
  );
}
