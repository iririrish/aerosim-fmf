import ResultCard from '../components/ResultCard.jsx';
import WarningPanel from '../components/WarningPanel.jsx';
import { MODELS, CURRENT_PHASE } from '../data/routes.js';
import { load } from '../services/localStorage.js';

export default function Dashboard() {
  // Phase 1 has no calculation engine, so every field is genuinely empty.
  const latest = load('latestCalculation', null);
  const history = load('history', []);
  const r = latest?.results ?? {};
  const state = latest?.state ?? {};

  return (
    <>
      <WarningPanel kind="info" title="Foundation release (phase 1 of 8)">
        Navigation, layout and deployment are in place. No calculation engine exists yet, so all
        results below are empty rather than estimated. Atmospheric import arrives in phase 2.
      </WarningPanel>

      <section className="grid cards">
        <ResultCard label="Atmospheric density" value={r.density ?? null} unit="kg/m³" hint="Total mass density from the uploaded dataset" />
        <ResultCard label="Knudsen number" value={r.knudsen ?? null} unit="" hint="Mean free path / characteristic length" />
        <ResultCard label="Drag force" value={r.drag ?? null} unit="N" hint="Free molecular flow, selected model" />
        <ResultCard label="Drag coefficient" value={r.cd ?? null} unit="" hint="Referenced to the stated area" />
        <ResultCard label="Drag acceleration" value={r.accel ?? null} unit="m/s²" hint="Drag force / spacecraft mass" />
      </section>

      <section className="grid two">
        <div className="card">
          <h2>Current setup</h2>
          <dl className="kv">
            <dt>Selected altitude</dt><dd>{state.altitude ?? 'Not selected'}</dd>
            <dt>Atmospheric dataset</dt><dd>{state.dataset ?? 'None imported'}</dd>
            <dt>Geometry</dt><dd>{state.geometry ?? 'Not configured'}</dd>
            <dt>Gas-surface model</dt><dd>{state.model ?? 'Not selected'}</dd>
            <dt>Calculation status</dt><dd>{latest ? 'Complete' : 'No calculation run'}</dd>
          </dl>
        </div>

        <div className="card">
          <h2>Gas-surface models</h2>
          <table>
            <thead><tr><th>Model</th><th>Status</th><th>Phase</th></tr></thead>
            <tbody>
              {MODELS.map((m) => (
                <tr key={m.id}>
                  <td>{m.name}</td>
                  <td><span className={`tag ${m.status}`}>{m.status}</span></td>
                  <td>{m.phase}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="note">A model is marked implemented only after it passes its validation tests.</p>
        </div>
      </section>

      <section className="card">
        <h2>Recent saved calculations</h2>
        {history.length === 0 ? (
          <p className="empty">Nothing saved yet. Saved cases will appear here once the calculator is available (phase 4).</p>
        ) : (
          <ul className="list">
            {history.slice(0, 5).map((h) => (
              <li key={h.id}>{h.name}</li>
            ))}
          </ul>
        )}
      </section>

      <p className="note">Development progress: phase {CURRENT_PHASE} of 8 complete.</p>
    </>
  );
}
