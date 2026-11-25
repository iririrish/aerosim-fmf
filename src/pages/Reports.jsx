import { useMemo, useState } from 'react';
import SolutionPanel from '../components/SolutionPanel.jsx';
import GraphPanel from '../components/GraphPanel.jsx';
import WarningPanel from '../components/WarningPanel.jsx';
import { runFMF } from '../calculations/engine.js';
import { buildSolutions } from '../calculations/solutions/buildSolutions.js';
import { altitudeSweep } from '../calculations/sweeps.js';
import { REFS } from '../data/references.js';
import { load } from '../services/localStorage.js';
import { download, toCSV, resultRows } from '../services/csvExport.js';
import { formatValue as fv } from '../utils/formatting.js';

export default function Reports() {
  const [title, setTitle] = useState('DragSail free molecular flow analysis'), [author, setAuthor] = useState('');
  const inp = load('calcInputs', null), rec = load('atmosphere.selected', null), ds = load('atmosphere.dataset', null);
  const { out, sols, prof } = useMemo(() => {
    const o = inp && rec ? runFMF(inp, rec.record) : null;
    const rows = o?.ok && ds?.records.length > 1 ? altitudeSweep(inp, ds.records).filter((r) => r.out.ok) : [];
    return { out: o, sols: o?.ok ? buildSolutions(o, inp) : [], prof: rows };
  }, []);
  if (!out?.ok) return <WarningPanel kind="warn" title="No valid calculation">{out ? out.errors.join(' ') : 'Run a calculation first.'}</WarningPanel>;
  const json = () => download('dragsail-report.json', JSON.stringify({ generated: new Date().toISOString(), title, author, inputs: inp, atmosphere: rec, results: { ...out, comp: undefined, panelDefs: undefined }, solutionIds: sols.map((s) => s.id), references: REFS }, null, 2), 'application/json');
  return (
    <>
      <div className="toolbar noprint">
        <input value={title} onChange={(e) => setTitle(e.target.value)} aria-label="Report title" /><input value={author} onChange={(e) => setAuthor(e.target.value)} placeholder="Author / project" aria-label="Author" />
        <button onClick={() => window.print()}>Print / save as PDF</button>
        <button className="ghost" onClick={() => download('dragsail-results.csv', toCSV(resultRows(out)), 'text/csv')}>Export CSV</button>
        <button className="ghost" onClick={json}>Export JSON</button>
      </div>
      <article className="report">
        <h1>{title}</h1><p className="note">{author && `${author} · `}Generated {new Date().toLocaleString()} · DragSail free molecular flow calculator</p>
        <h2>1. Conditions</h2>
        <p>Atmospheric record: <code>{rec.source}</code>, row {rec.row + 1}; altitude {fv(out.altKm)} km, T∞ = {fv(out.T)} K. Geometry: {inp.geometry}; model: {inp.model === 'sentman' ? `Sentman/DRIA (α = ${inp.alpha})` : `Maxwell (σ = ${inp.sigma})`}; T_w = {inp.Tw} K; mass {inp.massKg} kg.</p>
        <h2>2. Results</h2>
        <table><tbody>{resultRows(out).slice(1).map(([k, v, u]) => <tr key={k}><td>{k}</td><td>{typeof v === 'number' ? fv(v) : v ?? '—'}</td><td>{u}</td></tr>)}</tbody></table>
        {out.warnings.map((w) => <WarningPanel key={w} kind="warn">{w}</WarningPanel>)}
        {prof.length > 1 && <GraphPanel title="Drag force vs altitude (dataset records, same inputs)" xLabel="Altitude (km)" yLabel="Drag (N)" series={[{ name: 'Drag', points: prof.map((r) => ({ x: r.x, y: r.out.drag })) }]} />}
        <h2>3. Step-by-step solutions</h2>
        {sols.map((s, i) => <SolutionPanel key={s.id} sol={s} n={i + 1} open />)}
        <h2>4. Assumptions and limitations</h2><ul className="list">{out.assumptions.map((a) => <li key={a}>{a}</li>)}<li>Results are experimental until the validation suite is documented as passed for the intended use; this is not an orbital-lifetime prediction.</li></ul>
        <h2>5. References</h2><ul className="list">{[...new Set(sols.flatMap((s) => s.ref))].map((k) => <li key={k}>{REFS[k]}</li>)}</ul>
      </article>
    </>
  );
}
