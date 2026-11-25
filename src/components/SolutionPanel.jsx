import EquationDisplay from './EquationDisplay.jsx';
import { REFS } from '../data/references.js';

const KIND = { user: 'user input', atmosphere: 'atmosphere data', derived: 'derived', assumed: 'assumed', constant: 'constant', numerical: 'numerical' };

export default function SolutionPanel({ sol, n, open }) {
  return (
    <details className="card solution" open={open}>
      <summary><strong>{n}. {sol.name}</strong></summary>
      <h3>Physical purpose</h3><p>{sol.purpose}</p>
      <h3>Governing equation</h3><EquationDisplay tex={sol.equation} />
      <h3>Variables and units</h3>
      <table><tbody>{sol.vars.map((v) => <tr key={v.s}><td><EquationDisplay tex={v.s} block={false} /></td><td>{v.d}</td><td><EquationDisplay tex={v.u === '–' ? '-' : `\\mathrm{${v.u}}`} block={false} /></td></tr>)}</tbody></table>
      <h3>Given values</h3>
      <ul className="list">{sol.given.map((x, i) => <li key={i}><EquationDisplay tex={x.tex} block={false} /> <span className={`kind ${x.kind}`}>{KIND[x.kind]}</span></li>)}</ul>
      <h3>Substitution</h3><EquationDisplay tex={sol.substitution} />
      {sol.steps.length > 0 && <><h3>Intermediate calculations</h3>{sol.steps.map((s, i) => <EquationDisplay key={i} tex={s} />)}</>}
      <h3>Final answer <span className="kind numerical">numerically calculated</span></h3><EquationDisplay tex={sol.answer} />
      <h3>Physical interpretation</h3><p>{sol.interpretation}</p>
      <h3>Assumptions and limitations</h3>
      <ul className="list">{[...(sol.assumptions || []), sol.applicability && `Applicability: ${sol.applicability}`].filter(Boolean).map((a) => <li key={a}>{a}</li>)}</ul>
      <h3>Scientific reference</h3><ul className="list">{sol.ref.map((k) => <li key={k}>{REFS[k]}</li>)}</ul>
    </details>
  );
}
