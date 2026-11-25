import { formatValue } from '../utils/formatting.js';

// value === null means "not calculated yet": show a dash, never a placeholder number.
export default function ResultCard({ label, value, unit, hint }) {
  return (
    <div className="card result" title={hint}>
      <span className="label">{label}</span>
      <span className="value">
        {formatValue(value)}
        {value !== null && value !== undefined && unit && <small> {unit}</small>}
      </span>
      <span className="hint">{hint}</span>
    </div>
  );
}
