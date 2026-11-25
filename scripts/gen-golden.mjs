// Regenerate regression references ONLY after an intentional, reviewed change to the physics.
import { writeFileSync } from 'node:fs';
import { REG_CASES, REG_RECORD } from '../src/calculations/validation/suite.js';
import { runFMF } from '../src/calculations/engine.js';
const g = {};
for (const [k, inp] of Object.entries(REG_CASES)) { const o = runFMF(inp, REG_RECORD); g[k] = { Kn: o.Kn, V: o.V, drag: o.drag, Cd: o.Cd, accel: o.accel }; }
writeFileSync(new URL('../src/calculations/validation/golden.js', import.meta.url), `// Regression references (engine output at generation time; NOT independent validation).\nexport default ${JSON.stringify(g, null, 2)};\n`);
console.log(g);
