import { useEffect, useState } from 'react';
import Sidebar from './components/Sidebar.jsx';
import Header from './components/Header.jsx';
import ErrorBoundary from './components/ErrorBoundary.jsx';
import Dashboard from './pages/Dashboard.jsx';
import AtmosphericData from './pages/AtmosphericData.jsx';
import Configuration from './pages/Configuration.jsx';
import FMFCalculator from './pages/FMFCalculator.jsx';
import DetailedSolution from './pages/DetailedSolution.jsx';
import Results from './pages/Results.jsx';
import Methodology from './pages/Methodology.jsx';
import History from './pages/History.jsx';
import Reports from './pages/Reports.jsx';
import Validation from './pages/Validation.jsx';
import { ROUTES } from './data/routes.js';

const PAGES = { dashboard: Dashboard, atmosphere: AtmosphericData, configuration: Configuration, calculator: FMFCalculator, solution: DetailedSolution,
  results: Results, methodology: Methodology, history: History, reports: Reports, validation: Validation };

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
  const Page = PAGES[route.id];
  return (
    <div className="shell">
      <Sidebar current={route.id} />
      <main className="main">
        <Header route={route} />
        <ErrorBoundary key={route.id}><Page /></ErrorBoundary>
      </main>
    </div>
  );
}
