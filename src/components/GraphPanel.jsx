import { formatValue } from '../utils/formatting.js';

const COLORS = ['#38d4e8', '#3b82f6', '#f0b429', '#7ee2a8'];
export default function GraphPanel({ title, series, xLabel, yLabel, logY = false }) {
  const W = 640, H = 300, m = { l: 78, r: 16, t: 28, b: 46 };
  const tf = (y) => (logY ? Math.log10(y) : y);
  const pts = series.flatMap((s) => s.points).filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y) && (!logY || p.y > 0));
  if (!pts.length) return <div className="card"><h2>{title}</h2><p className="empty">No finite values to plot.</p></div>;
  const [x0, x1] = [Math.min(...pts.map((p) => p.x)), Math.max(...pts.map((p) => p.x))];
  const ys = pts.map((p) => tf(p.y));
  let [y0, y1] = [Math.min(...ys), Math.max(...ys)];
  if (y0 === y1) { y0 -= 1; y1 += 1; } else { const pad = (y1 - y0) * 0.08; y0 -= pad; y1 += pad; }
  const X = (x) => m.l + (x1 === x0 ? 0.5 : (x - x0) / (x1 - x0)) * (W - m.l - m.r), Y = (y) => H - m.b - ((tf(y) - y0) / (y1 - y0)) * (H - m.t - m.b);
  const ticks = (a, b) => Array.from({ length: 5 }, (_, k) => a + ((b - a) * k) / 4);
  return (
    <div className="card"><h2>{title}</h2>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={title} className="graph">
        {ticks(y0, y1).map((t) => <g key={t}><line x1={m.l} x2={W - m.r} y1={H - m.b - ((t - y0) / (y1 - y0)) * (H - m.t - m.b)} y2={H - m.b - ((t - y0) / (y1 - y0)) * (H - m.t - m.b)} stroke="#1f3558" />
          <text x={m.l - 6} y={H - m.b - ((t - y0) / (y1 - y0)) * (H - m.t - m.b) + 4} textAnchor="end" fontSize="11" fill="#8ea3c2">{formatValue(logY ? 10 ** t : t, 3)}</text></g>)}
        {ticks(x0, x1).map((t) => <text key={t} x={X(t)} y={H - m.b + 16} textAnchor="middle" fontSize="11" fill="#8ea3c2">{formatValue(t, 4)}</text>)}
        <text x={(W + m.l) / 2} y={H - 6} textAnchor="middle" fontSize="12" fill="#dce6f5">{xLabel}</text>
        <text x={14} y={H / 2} transform={`rotate(-90 14 ${H / 2})`} textAnchor="middle" fontSize="12" fill="#dce6f5">{yLabel}</text>
        {series.map((s, i) => {
          const p = s.points.filter((q) => Number.isFinite(q.y) && (!logY || q.y > 0));
          return <g key={s.name}><polyline fill="none" stroke={COLORS[i % 4]} strokeWidth="2" points={p.map((q) => `${X(q.x)},${Y(q.y)}`).join(' ')} />
            {p.map((q, k) => <circle key={k} cx={X(q.x)} cy={Y(q.y)} r="2.5" fill={COLORS[i % 4]} />)}</g>;
        })}
      </svg>
      {series.length > 1 && <p className="note">{series.map((s, i) => <span key={s.name} style={{ color: COLORS[i % 4], marginRight: 12 }}>● {s.name}</span>)}</p>}
    </div>
  );
}
