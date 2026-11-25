import { useState } from 'react';
import GraphPanel from '../components/GraphPanel.jsx';
import WarningPanel from '../components/WarningPanel.jsx';
import { PARAMS, OUTPUTS, linspace, sweep, altitudeSweep, sensitivity } from '../calculations/sweeps.js';
import { compareDSMC } from '../calculations/compare.js';
import { parseText } from '../calculations/atmospheric/dataParser.js';
import { runFMF } from '../calculations/engine.js';
import { load } from '../services/localStorage.js';
import { formatValue as fv } from '../utils/formatting.js';

export default function Results() {
  const inp = load('calcInputs', null), rec = load('atmosphere.selected', null), ds = load('atmosphere.dataset', null);
  const [param, setParam] = useState('incl'), [a, setA] = useState(''), [b, setB] = useState(''), [n, setN] = useState('20');
  const [vars, setVars] = useState({ drag: true, Cd: true }), [logY, setLogY] = useState(false);
  const [res, setRes] = useState(null), [sens, setSens] = useState({}), [sensOut, setSensOut] = useState(null), [dsmc, setDsmc] = useState(null);
  const base = inp && rec ? runFMF(inp, rec.record) : null;
  if (!base?.ok) return <WarningPanel kind="warn" title="Run a valid calculation first">{base ? base.errors.join(' ') : 'Select an atmospheric record and enter inputs on the FMF calculator.'}</WarningPanel>;

  const avail = Object.entries(PARAMS).filter(([, p]) => !p.model || p.model === inp.model);
  const run = () => {
    if (param === 'altitude') {
      if (!ds || ds.records.length < 2) return setRes({ error: 'Altitude sweeps need a dataset with at least two valid records (import it on the Atmospheric data page and press "Use this record").' });
      return setRes({ param, rows: altitudeSweep(inp, ds.records) });
    }
    const lo = Number(a), hi = Number(b), k = Math.round(Number(n));
    if (a === '' || b === '' || !Number.isFinite(lo) || !Number.isFinite(hi) || !(k >= 2 && k <= 200)) return setRes({ error: 'Enter minimum, maximum and 2–200 points.' });
    setRes({ param, rows: sweep(inp, rec.record, param, linspace(lo, hi, k)) });
  };
  const runSens = () => {
    const ranges = Object.fromEntries(Object.entries(sens).filter(([, r]) => r.min !== undefined && r.min !== '' && r.max !== undefined && r.max !== '').map(([k, r]) => [k, { min: Number(r.min), max: Number(r.max) }]));
    setSensOut(Object.keys(ranges).length ? sensitivity(inp, rec.record, ranges) : { rows: [], error: 'Enter both min and max for at least one parameter. No default ranges are assumed.' });
  };
  const okRows = res?.rows?.filter((r) => r.out.ok) ?? [];
  const skipped = (res?.rows?.length ?? 0) - okRows.length;
  const onDsmc = async (e) => {
    const f = e.target.files[0]; if (!f) return;
    try {
      if (!ds || ds.records.length < 1) throw new Error('Import an atmospheric dataset first.');
      setDsmc(compareDSMC(parseText(await f.text(), f.name), altitudeSweep(inp, ds.records)));
    } catch (er) { setDsmc({ rows: [], error: er.message }); }
  };

  return (
    <>
      <p className="note">Graphs use the calculator's current inputs and record. Everything else is held at its nominal value.</p>
      <div className="card"><h2>Parametric sweep</h2><div className="form">
        <label className="field"><span>Swept parameter</span><select value={param} onChange={(e) => setParam(e.target.value)}>{avail.map(([k, p]) => <option key={k} value={k}>{p.label}{p.unit && ` (${p.unit})`}</option>)}</select></label>
        {param !== 'altitude' && <><label className="field"><span>Minimum</span><input value={a} onChange={(e) => setA(e.target.value)} /></label>
          <label className="field"><span>Maximum</span><input value={b} onChange={(e) => setB(e.target.value)} /></label>
          <label className="field"><span>Points</span><input value={n} onChange={(e) => setN(e.target.value)} /></label></>}
      </div>
        <p>{Object.entries(OUTPUTS).map(([k, [l]]) => <label className="check inline" key={k}><input type="checkbox" checked={!!vars[k]} onChange={(e) => setVars({ ...vars, [k]: e.target.checked })} /> {l}</label>)}
          <label className="check inline"><input type="checkbox" checked={logY} onChange={(e) => setLogY(e.target.checked)} /> log y-axis</label></p>
        <button onClick={run}>Run sweep</button>
      </div>
      {res?.error && <WarningPanel kind="error">{res.error}</WarningPanel>}
      {skipped > 0 && <WarningPanel kind="warn">{skipped} point(s) were skipped because the inputs were invalid there: {res.rows.find((r) => !r.out.ok).out.errors[0]}</WarningPanel>}
      {okRows.length > 0 && Object.entries(OUTPUTS).filter(([k]) => vars[k]).map(([k, [label, unit]]) =>
        <GraphPanel key={k} title={`${label} vs ${PARAMS[res.param].label}`} xLabel={`${PARAMS[res.param].label}${PARAMS[res.param].unit ? ` (${PARAMS[res.param].unit})` : ''}`} yLabel={`${label}${unit ? ` (${unit})` : ''}`} logY={logY}
          series={[{ name: label, points: okRows.map((r) => ({ x: r.x, y: r.out[k] })) }]} />)}

      <div className="card"><h2>Sensitivity (user-supplied ranges)</h2>
        <WarningPanel kind="info">One-at-a-time variation between the minimum and maximum you enter. This is a sensitivity analysis, not a statistical uncertainty propagation. No ranges are assumed.</WarningPanel>
        <table><thead><tr><th>Parameter</th><th>Min</th><th>Max</th></tr></thead><tbody>
          {avail.filter(([k]) => k !== 'altitude').map(([k, p]) => <tr key={k}><td>{p.label}</td>
            {['min', 'max'].map((s) => <td key={s}><input value={sens[k]?.[s] ?? ''} onChange={(e) => setSens({ ...sens, [k]: { ...sens[k], [s]: e.target.value } })} aria-label={`${p.label} ${s}`} /></td>)}</tr>)}
        </tbody></table>
        <button onClick={runSens}>Compute sensitivity</button>
        {sensOut?.error && <WarningPanel kind="error">{sensOut.error}</WarningPanel>}
        {sensOut?.rows.length > 0 && <table><thead><tr><th>Parameter</th><th>Drag at min (N)</th><th>Drag at max (N)</th><th>Δ at min</th><th>Δ at max</th></tr></thead><tbody>
          {sensOut.rows.map((r) => <tr key={r.param}><td>{PARAMS[r.param].label}</td><td>{fv(r.dMin)}</td><td>{fv(r.dMax)}</td><td>{r.pMin === null ? '—' : `${r.pMin.toFixed(2)} %`}</td><td>{r.pMax === null ? '—' : `${r.pMax.toFixed(2)} %`}</td></tr>)}</tbody></table>}
        {sensOut?.base && <p className="note">Nominal drag = {fv(sensOut.base.drag)} N.</p>}
      </div>

      <div className="card"><h2>Compare with imported DSMC results</h2>
        <p className="note">Upload CSV/JSON from an external DSMC run (altitude, drag force and/or Cd). FMF values are calculated here; DSMC values are imported and unverified by this app. Matching is by altitude (±0.5 km) against the imported atmospheric dataset.</p>
        <input type="file" accept=".csv,.json,.txt" onChange={onDsmc} aria-label="Upload DSMC results" />
        {dsmc?.error && <WarningPanel kind="error">{dsmc.error}</WarningPanel>}
        {dsmc?.rows.length > 0 && <table><thead><tr><th>Alt (km)</th><th>FMF drag (calc)</th><th>DSMC drag (import)</th><th>Error %</th><th>FMF Cd (calc)</th><th>DSMC Cd (import)</th><th>Error %</th></tr></thead><tbody>
          {dsmc.rows.map((r, i) => <tr key={i}><td>{fv(r.alt)}</td><td>{fv(r.fmfDrag)}</td><td>{fv(r.dsmcDrag)}</td><td>{fv(r.errDrag)}</td><td>{fv(r.fmfCd)}</td><td>{fv(r.dsmcCd)}</td><td>{fv(r.errCd)}</td></tr>)}</tbody></table>}
      </div>
    </>
  );
}
