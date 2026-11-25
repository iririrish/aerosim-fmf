import { runValidation } from '../src/calculations/validation/suite.js';
const r = runValidation(); let f = 0;
for (const x of r) { if (!x.pass) f++; console.log(`${x.pass ? 'PASS' : 'FAIL'}  [${x.group}] ${x.name} ${x.info}`); }
console.log(f ? `\n${f} of ${r.length} FAILED` : `\nAll ${r.length} checks passed`); process.exit(f ? 1 : 0);
