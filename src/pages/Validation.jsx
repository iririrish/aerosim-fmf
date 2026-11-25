import { useState } from 'react';
import { runValidation } from '../calculations/validation/suite.js';

export default function Validation() {
  const [r, setR] = useState(null);
  const fails = r?.filter((x) => !x.pass).length;
  return (
    <>
      <p>The same suite runs from the command line with <code>npm test</code> and gates deployment.</p>
      <button onClick={() => setR(runValidation())}>Run validation suite</button>
      {r && <div className="card"><p><strong>{r.length - fails} of {r.length} passed.</strong> {fails ? 'Some checks failed.' : 'All checks passed.'}</p>
        <table><thead><tr><th>Group</th><th>Check</th><th>Result</th><th>Detail</th></tr></thead><tbody>
          {r.map((x, i) => <tr key={i}><td>{x.group}</td><td>{x.name}</td><td><span className={`tag ${x.pass ? 'implemented' : 'planned'}`}>{x.pass ? 'pass' : 'FAIL'}</span></td><td>{x.info}</td></tr>)}</tbody></table></div>}
    </>
  );
}
