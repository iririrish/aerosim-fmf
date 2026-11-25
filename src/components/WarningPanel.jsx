export default function WarningPanel({ kind = 'info', title, children }) {
  return (
    <div className={`warning ${kind}`} role={kind === 'error' ? 'alert' : 'note'}>
      {title && <strong>{title}</strong>}
      <div>{children}</div>
    </div>
  );
}
