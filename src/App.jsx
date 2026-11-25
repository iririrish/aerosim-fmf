import { useEffect, useState } from 'react';
import Sidebar from './components/Sidebar.jsx';
import Header from './components/Header.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Placeholder from './pages/Placeholder.jsx';
import { ROUTES } from './data/routes.js';

// Hash routing keeps deep links working on GitHub Pages with no server config.
function useHashRoute() {
  const read = () => window.location.hash.replace(/^#\/?/, '') || 'dashboard';
  const [id, setId] = useState(read);
  useEffect(() => {
    const on = () => setId(read());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return id;
}

export default function App() {
  const id = useHashRoute();
  const route = ROUTES.find((r) => r.id === id) ?? ROUTES[0];

  return (
    <div className="shell">
      <Sidebar current={route.id} />
      <main className="main">
        <Header route={route} />
        {route.id === 'dashboard' ? <Dashboard /> : <Placeholder route={route} />}
      </main>
    </div>
  );
}
