import { ROUTES, CURRENT_PHASE } from '../data/routes.js';

export default function Sidebar({ current }) {
  return (
    <nav className="sidebar" aria-label="Main navigation">
      <a className="brand" href="#/dashboard">
        <span className="brand-mark" aria-hidden="true" />
        <span>
          <strong>DragSail</strong>
          <small>Free molecular flow</small>
        </span>
      </a>
      <ul>
        {ROUTES.map((r) => (
          <li key={r.id}>
            <a
              href={`#/${r.id}`}
              className={r.id === current ? 'active' : ''}
              aria-current={r.id === current ? 'page' : undefined}
            >
              <span>{r.label}</span>
              {r.phase > CURRENT_PHASE && <em title={`Available in phase ${r.phase}`}>P{r.phase}</em>}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
