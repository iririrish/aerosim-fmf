// Navigation registry. `phase` = development phase in which the page becomes functional.
export const ROUTES = [
  { id: 'dashboard', label: 'Dashboard', phase: 1, summary: 'Project overview and latest results.' },
  { id: 'atmosphere', label: 'Atmospheric data', phase: 2, summary: 'Import NRLMSISE-00 output, map columns, validate units, select conditions.' },
  { id: 'configuration', label: 'DragSail configuration', phase: 4, summary: 'Spacecraft mass, sail geometry, orientation, surface properties.' },
  { id: 'calculator', label: 'FMF calculator', phase: 4, summary: 'Main workspace: atmosphere, orbit, geometry, gas-surface interaction, settings.' },
  { id: 'solution', label: 'Detailed solution', phase: 5, summary: 'Step-by-step equations with live substitutions and interpretation.' },
  { id: 'results', label: 'Results and graphs', phase: 6, summary: 'Result cards, altitude profiles, orientation and accommodation sensitivity.' },
  { id: 'methodology', label: 'Equations and methodology', phase: 5, summary: 'Searchable reference library with assumptions and citations.' },
  { id: 'history', label: 'Calculation history', phase: 7, summary: 'Save, rename, reopen, compare and export cases.' },
  { id: 'reports', label: 'Report generator', phase: 7, summary: 'Engineering reports exported to PDF, CSV and JSON.' },
];

// Honest status of each gas-surface model. Nothing is "implemented" until its phase is done and validated.
export const MODELS = [
  { id: 'maxwell', name: 'Maxwell specular-diffuse', phase: 4, status: 'planned' },
  { id: 'sentman', name: 'Sentman / DRIA', phase: 4, status: 'planned' },
  { id: 'cll', name: 'Cercignani-Lampis-Lord (CLL)', phase: 4, status: 'planned' },
];

export const CURRENT_PHASE = 1;
