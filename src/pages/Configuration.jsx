import WarningPanel from '../components/WarningPanel.jsx';
import { load } from '../services/localStorage.js';

export default function Configuration() {
  const inp = load('calcInputs', null);
  const th = Number(inp?.incl);
  const has = inp && inp.geometry !== 'custom' && Number.isFinite(th) && inp.incl !== '';
  const t = (th * Math.PI) / 180, dx = -Math.sin(t) * 70, dy = Math.cos(t) * 70;
  return (
    <>
      <p>Edit geometry, mass and surface properties in section C of the <a href="#/calculator">FMF calculator</a>. The schematic shows the saved inclination.</p>
      {!has && <WarningPanel kind="info">Enter a simple geometry and inclination in the calculator to see the schematic (custom panels are not drawn).</WarningPanel>}
      {has && <div className="card"><svg viewBox="0 0 360 200" className="graph" role="img" aria-label="Side view of sail inclination">
        <defs><marker id="ar" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto"><path d="M0,0 L6,3 L0,6 z" fill="#38d4e8" /></marker></defs>
        {[50, 100, 150].map((y) => <line key={y} x1="340" y1={y} x2="40" y2={y} stroke="#38d4e8" strokeWidth="1.5" markerEnd="url(#ar)" opacity="0.7" />)}
        <line x1={180 - dx} y1={100 - dy} x2={180 + dx} y2={100 + dy} stroke="#3b82f6" strokeWidth="5" />
        <line x1="180" y1="100" x2={180 + Math.cos(t) * 40} y2={100 + Math.sin(t) * 40} stroke="#f0b429" strokeWidth="2" markerEnd="url(#ar)" />
        <text x="10" y="190" fill="#8ea3c2" fontSize="11">Side view. Cyan: gas flow relative to the sail (spacecraft moves right). Amber: sail normal, {inp.incl}° from the velocity.</text>
      </svg>
        <p className="note">Geometry: {inp.geometry}; both faces exposed: {inp.both ? 'yes' : 'no'}; orientation about the velocity axis: {inp.orient}°. Schematic only, not to scale.</p></div>}
    </>
  );
}
