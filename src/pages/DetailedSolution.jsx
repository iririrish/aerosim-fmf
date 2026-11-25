import { useMemo, useState } from 'react';
import SolutionPanel from '../components/SolutionPanel.jsx';
import EquationDisplay from '../components/EquationDisplay.jsx';
import WarningPanel from '../components/WarningPanel.jsx';
import { runFMF } from '../calculations/engine.js';
import { buildSolutions } from '../calculations/solutions/buildSolutions.js';
import { REFS } from '../data/references.js';
import { load } from '../services/localStorage.js';

export default function DetailedSolution() {
  const [view, setView] = useState('solutions'), [expand, setExpand] = useState(false);
  const inp = load('calcInputs', null), rec = load('atmosphere.selected', null);
  const { out, sols } = useMemo(() => {
    const o = inp ? runFMF(inp, rec?.record) : null;
    return { out: o, sols: o?.ok ? buildSolutions(o, inp) : [] };
  }, []);
  if (!out?.ok) return <WarningPanel kind="warn" title="Nothing to show yet">{out ? out.errors.join(' ') : 'Enter inputs on the FMF calculator.'} Solutions are rebuilt from the calculator's current inputs.</WarningPanel>;
  const btn = (v, label, ex) => <button className={view === v && (ex === undefined || ex === expand) ? '' : 'ghost'} onClick={() => { setView(v); if (ex !== undefined) setExpand(ex); }}>{label}</button>;
  return (
    <>
      <p className="note">Rebuilt from the calculator's current inputs (reload the page after editing them there).</p>
      <div className="toolbar">{btn('solutions', 'Show Complete Solution', true)} {btn('equations', 'Show All Equations')} {btn('variables', 'Show Variable Definitions')} {btn('assumptions', 'Show Assumptions')} {btn('refs', 'Show Scientific References')}</div>
      {out.warnings.map((w) => <WarningPanel key={w} kind="warn">{w}</WarningPanel>)}
      {view === 'solutions' && sols.map((s, i) => <SolutionPanel key={`${s.id}${expand}`} sol={s} n={i + 1} open={expand} />)}
      {view === 'equations' && <div className="card">{sols.map((s) => <div key={s.id}><h3>{s.name}</h3><EquationDisplay tex={s.equation} /></div>)}</div>}
      {view === 'variables' && <div className="card"><table><thead><tr><th>Symbol</th><th>Meaning</th><th>Unit</th></tr></thead><tbody>
        {[...new Map(sols.flatMap((s) => s.vars).map((v) => [v.s, v])).values()].map((v) => <tr key={v.s}><td><EquationDisplay tex={v.s} block={false} /></td><td>{v.d}</td><td><EquationDisplay tex={v.u === '–' ? '-' : `\\mathrm{${v.u}}`} block={false} /></td></tr>)}</tbody></table></div>}
      {view === 'assumptions' && <div className="card"><ul className="list">{[...new Set(sols.flatMap((s) => [...(s.assumptions || []), ...[]]).concat(out.assumptions))].map((a) => <li key={a}>{a}</li>)}</ul></div>}
      {view === 'refs' && <div className="card"><ul className="list">{[...new Set(sols.flatMap((s) => s.ref))].map((k) => <li key={k}>{REFS[k]}</li>)}</ul></div>}
    </>
  );
}
