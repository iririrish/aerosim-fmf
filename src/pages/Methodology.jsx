import { useState } from 'react';
import EquationDisplay from '../components/EquationDisplay.jsx';
import { METHODS, METHOD_ORDER, REFS } from '../data/references.js';

export default function Methodology() {
  const [q, setQ] = useState('');
  const list = METHOD_ORDER.map((id) => ({ id, ...METHODS[id] })).filter((m) => JSON.stringify(m).toLowerCase().includes(q.toLowerCase()));
  return (
    <>
      <input className="search" placeholder="Search equations, variables, references…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search methodology" />
      {list.length === 0 && <p className="empty">No match.</p>}
      {list.map((m) => (
        <div className="card" key={m.id}>
          <h2>{m.name}{!m.equation && <span className="tag planned"> planned</span>}</h2>
          <p>{m.purpose}</p>
          <EquationDisplay tex={m.equation} />
          {m.vars.length > 0 && <table><tbody>{m.vars.map((v) => <tr key={v.s}><td><EquationDisplay tex={v.s} block={false} /></td><td>{v.d}</td><td><EquationDisplay tex={v.u === '–' ? '-' : `\\mathrm{${v.u}}`} block={false} /></td></tr>)}</tbody></table>}
          <p><strong>Applicability:</strong> {m.applicability}</p>
          {m.assumptions.length > 0 && <ul className="list">{m.assumptions.map((a) => <li key={a}>{a}</li>)}</ul>}
          {m.ref.map((k) => <p className="note" key={k}>{REFS[k]}</p>)}
        </div>))}
    </>
  );
}
