import { useState } from 'react';
import { load, save } from '../services/localStorage.js';
import { download, toCSV } from '../services/csvExport.js';
import { formatValue as fv } from '../utils/formatting.js';

export default function History() {
  const [list, setList] = useState(() => load('history', []));
  const [pick, setPick] = useState([]);
  const put = (l) => { setList(l); save('history', l); };
  const open = (h) => { save('calcInputs', h.inputs); save('atmosphere.selected', h.rec); window.location.hash = '#/calculator'; };
  const rename = (h) => { const nm = window.prompt('New name', h.name); if (nm) put(list.map((x) => (x.id === h.id ? { ...x, name: nm } : x))); };
  const del = (h) => { if (window.confirm(`Delete "${h.name}"?`)) put(list.filter((x) => x.id !== h.id)); };
  const cmp = list.filter((h) => pick.includes(h.id));
  const keys = [['altKm', 'Altitude (km)'], ['rho', 'ρ (kg/m³)'], ['Kn', 'Kn'], ['V', 'V_rel (m/s)'], ['drag', 'Drag (N)'], ['Cd', 'Cd'], ['accel', 'a_D (m/s²)']];
  return (
    <>
      {list.length === 0 ? <p className="empty">No saved calculations. Use "Save calculation" on the FMF calculator after a successful run.</p> : (
        <div className="card"><table><thead><tr><th>Compare</th><th>Name</th><th>Saved</th><th>Drag (N)</th><th>Cd</th><th></th></tr></thead><tbody>
          {list.map((h) => <tr key={h.id}><td><input type="checkbox" checked={pick.includes(h.id)} onChange={(e) => setPick(e.target.checked ? [...pick, h.id] : pick.filter((i) => i !== h.id))} aria-label={`Compare ${h.name}`} /></td>
            <td>{h.name}</td><td>{h.date.slice(0, 16).replace('T', ' ')}</td><td>{fv(h.results.drag)}</td><td>{fv(h.results.Cd)}</td>
            <td><button className="ghost" onClick={() => open(h)}>Reopen</button> <button className="ghost" onClick={() => rename(h)}>Rename</button> <button className="ghost" onClick={() => del(h)}>Delete</button></td></tr>)}
        </tbody></table>
          <button onClick={() => download('dragsail-history.json', JSON.stringify(list, null, 2), 'application/json')}>Export JSON</button>{' '}
          <button className="ghost" onClick={() => download('dragsail-history.csv', toCSV([['name', 'date', ...keys.map((k) => k[0])], ...list.map((h) => [h.name, h.date, ...keys.map(([k]) => h.results[k])])]), 'text/csv')}>Export CSV</button></div>)}
      {cmp.length >= 2 && <div className="card"><h2>Comparison</h2><table><thead><tr><th>Quantity</th>{cmp.map((h) => <th key={h.id}>{h.name}</th>)}</tr></thead><tbody>
        {keys.map(([k, l]) => <tr key={k}><td>{l}</td>{cmp.map((h) => <td key={h.id}>{fv(h.results[k])}</td>)}</tr>)}</tbody></table></div>}
    </>
  );
}
