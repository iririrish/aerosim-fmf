import WarningPanel from '../components/WarningPanel.jsx';

export default function Placeholder({ route }) {
  return (
    <WarningPanel kind="warn" title={`Not available yet — phase ${route.phase}`}>
      This page is planned and has no working calculation or data handling. It is listed so the
      navigation structure is fixed; it will be implemented in phase {route.phase}.
    </WarningPanel>
  );
}
