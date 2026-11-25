export default function Header({ route }) {
  return (
    <header className="header">
      <ol className="crumbs" aria-label="Breadcrumb">
        <li><a href="#/dashboard">DragSail</a></li>
        <li aria-current="page">{route.label}</li>
      </ol>
      <h1>{route.label}</h1>
      <p>{route.summary}</p>
    </header>
  );
}
