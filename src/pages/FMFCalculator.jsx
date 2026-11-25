import { useState } from 'react';
import ResultCard from '../components/ResultCard.jsx';
import WarningPanel from '../components/WarningPanel.jsx';
import { runFMF } from '../calculations/engine.js';
import { load, save } from '../services/localStorage.js';
import { formatValue as fv } from '../utils/formatting.js';

const INIT = { massKg: '', geometry: 'flat', L: '', W: '', D: '', panelsJson: '', incl: '', orient: '0', both: true, Lc: '', Aref: '',
  Tw: '', model: 'sentman', alpha: '', sigma: '', orbInc: '', argLat: '', corot: true, wE: '', wN: '', wU: '', anom: 'add', allowMissing: false };

export default function FMFCalculator() {
  const [inp, setInp] = useState(() => load('calcInputs', INIT));
  const [out, setOut] = useState(null);
  const rec = load('atmosphere.selected', null);
  const set = (k) => (e) => { const next = { ...inp, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }; setInp(next); save('calcInputs', next); };
  const F = ({ k, label, unit, ph }) => (
    <label className="field"><span>{label}{unit && <small> ({unit})</small>}</span><input value={inp[k]} onChange={set(k)} placeholder={ph} inputMode="decimal" /></label>);

  const calc = () => {
    const r = runFMF(inp, rec?.record);
    setOut(r); save('calcInputs', inp);
    if (r.ok) save('latestCalculation', { state: { altitude: `${fv(r.altKm)} km`, dataset: rec.source, geometry: inp.geometry, model: inp.model },
      results: { density: r.rhoSum, knudsen: r.Kn, drag: r.drag, cd: r.Cd, accel: r.accel } });
  };
  const saveCase = () => {
    const name = window.prompt('Name for this calculation', `Case ${load('history', []).length + 1}`);
    if (!name) return;
    save('history', [{ id: Date.now(), name, date: new Date().toISOString(), inputs: inp, rec, results: { altKm: out.altKm, rho: out.rhoSum, Kn: out.Kn, V: out.V, drag: out.drag, lift: out.lift, Cd: out.Cd, accel: out.accel } }, ...load('history', [])]);
  };
  const g = inp.geometry;

  return (
    <>
      <WarningPanel kind="warn" title="Experimental: Maxwell and Sentman models pass internal quadrature and limiting-case checks, not the full phase 8 validation.">
        Required physical inputs start empty on purpose: nothing is assumed silently. CLL is not implemented.
      </WarningPanel>

      <div className="card"><h2>A. Atmospheric conditions</h2>
        {rec ? <p>Record from <code>{rec.source}</code>: {fv(rec.record.alt_km)} km, T∞ = {fv(rec.record.T)} K.</p> : <p className="empty">Select a record on the Atmospheric data page first.</p>}
        <label className="field"><span>Anomalous oxygen handling</span>
          <select value={inp.anom} onChange={set('anom')}><option value="add">Add to atomic O (separate population)</option><option value="exclude">Exclude (already inside other densities)</option></select></label>
        <label className="check"><input type="checkbox" checked={inp.allowMissing} onChange={set('allowMissing')} /> Continue without species missing from the file</label>
      </div>

      <div className="card"><h2>B. Spacecraft and orbit</h2><div className="form">
        <F k="massKg" label="Spacecraft mass (complete spacecraft)" unit="kg" />
        <F k="orbInc" label="Orbit inclination" unit="deg" /><F k="argLat" label="Argument of latitude" unit="deg" />
        <label className="check"><input type="checkbox" checked={inp.corot} onChange={set('corot')} /> Atmosphere co-rotates with Earth</label>
        <F k="wE" label="Wind east" unit="m/s" ph="0" /><F k="wN" label="Wind north" unit="m/s" ph="0" /><F k="wU" label="Wind up" unit="m/s" ph="0" />
      </div></div>

      <div className="card"><h2>C. DragSail geometry</h2><div className="form">
        <label className="field"><span>Geometry</span><select value={g} onChange={set('geometry')}>
          <option value="flat">Flat plate</option><option value="rect">Rectangular sail</option><option value="square">Square sail</option>
          <option value="circle">Circular sail</option><option value="custom">Panel-based (JSON)</option></select></label>
        {(g === 'flat' || g === 'rect') && <><F k="L" label="Length" unit="m" /><F k="W" label="Width" unit="m" /></>}
        {g === 'square' && <F k="L" label="Side" unit="m" />}
        {g === 'circle' && <F k="D" label="Diameter" unit="m" />}
        {g !== 'custom' && <><F k="incl" label="Inclination: angle between sail normal and velocity (0° = face-on)" unit="deg" />
          <F k="orient" label="Orientation: rotation of normal about velocity axis" unit="deg" />
          <label className="check"><input type="checkbox" checked={inp.both} onChange={set('both')} /> Both faces exposed (same surface)</label></>}
        {g === 'custom' && <label className="field wide"><span>Panels (flow frame: +x = velocity direction)</span>
          <textarea rows={5} value={inp.panelsJson} onChange={set('panelsJson')} placeholder='[{"area":1,"normal":[1,0,0],"faces":"both","Tw":300,"alpha":0.9}]' /></label>}
        <F k="Lc" label="Characteristic length (blank = largest dimension)" unit="m" /><F k="Aref" label="Reference area (blank = total panel area)" unit="m²" />
      </div></div>

      <div className="card"><h2>D. Gas-surface interaction</h2><div className="form">
        <label className="field"><span>Model</span><select value={inp.model} onChange={set('model')}>
          <option value="sentman">Sentman / DRIA (diffuse, incomplete energy accommodation)</option>
          <option value="maxwell">Maxwell specular-diffuse</option><option disabled>CLL — planned</option></select></label>
        <F k="Tw" label="Surface temperature" unit="K" />
        {inp.model === 'sentman' ? <F k="alpha" label="Energy accommodation α (0–1)" /> : <F k="sigma" label="Diffuse fraction σ (0 = specular, 1 = diffuse)" />}
      </div></div>

      <div className="card"><h2>E. Run</h2>
        <button onClick={calc}>Calculate</button> <button className="ghost" onClick={() => { setInp(INIT); save('calcInputs', INIT); setOut(null); }}>Reset</button> <button className="ghost" onClick={saveCase} disabled={!out?.ok}>Save calculation</button> <a href="#/history">Load previous calculation</a></div>

      {out && !out.ok && <WarningPanel kind="error" title="Cannot calculate yet">{out.errors.map((e) => <div key={e}>• {e}</div>)}</WarningPanel>}
      {out?.ok && <>
        {out.warnings.map((w) => <WarningPanel key={w} kind="warn">{w}</WarningPanel>)}
        <section className="grid cards">
          <ResultCard label="Mass density Σnᵢmᵢ" value={out.rhoSum} unit="kg/m³" hint={out.rho !== undefined ? `Uploaded ρ: ${fv(out.rho)}` : 'No ρ in file'} />
          <ResultCard label="Mean free path" value={out.lambda} unit="m" />
          <ResultCard label="Knudsen number" value={out.Kn} hint={`Regime: ${out.regime} (Lc = ${fv(out.Lc)} m)`} />
          <ResultCard label="Relative velocity" value={out.V} unit="m/s" hint={`Orbital ${fv(out.vel.vOrbital)}, co-rotation ${fv(out.vel.vCorot)} m/s`} />
          <ResultCard label="Drag force" value={out.drag} unit="N" />
          <ResultCard label="Lift / side force" value={out.lift} unit="N" hint="Perpendicular to velocity" />
          <ResultCard label="Drag coefficient" value={out.Cd} hint={`Aref = ${fv(out.Aref)} m², ρ = Σnᵢmᵢ`} />
          <ResultCard label="Drag acceleration" value={out.accel} unit="m/s²" hint={`Direction (inertial): ${out.accelDir.map((x) => x.toFixed(3)).join(', ')}`} />
        </section>
        <div className="card"><h2>Species and speed ratios (T∞ = {fv(out.T)} K)</h2><table><thead><tr><th>Species</th><th>n (m⁻³)</th><th>m (kg)</th><th>v_mp (m/s)</th><th>S = V/v_mp</th></tr></thead>
          <tbody>{out.species.map((s) => <tr key={s.key}><td>{s.key.toUpperCase()}</td><td>{fv(s.n)}</td><td>{fv(s.m)}</td><td>{fv(s.vmp)}</td><td>{fv(s.S)}</td></tr>)}</tbody></table></div>
        <div className="card"><h2>Panels (force on spacecraft, flow frame)</h2><table><thead><tr><th>Panel</th><th>Area (m²)</th><th>Exposed</th><th>Fx</th><th>Fy</th><th>Fz</th><th>Drag (N)</th></tr></thead>
          <tbody>{out.panels.map((p) => <tr key={p.id}><td>{p.id}</td><td>{fv(p.area)}</td><td>{p.exposed ? 'yes' : 'no'}</td>{p.force.map((x, i) => <td key={i}>{fv(x)}</td>)}<td>{fv(p.drag)}</td></tr>)}</tbody></table></div>
        <div className="card"><h2>Assumptions</h2><ul className="list">{out.assumptions.map((a) => <li key={a}>{a}</li>)}</ul>
          <p className="note">Step-by-step solution panels arrive in phase 5. This is a drag acceleration, not an orbital-decay prediction.</p></div>
      </>}
    </>
  );
}
