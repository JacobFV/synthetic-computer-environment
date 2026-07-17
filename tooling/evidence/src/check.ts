import { seedEvidenceSuite, validateEvidenceSuite } from './index.js';

const findings = validateEvidenceSuite();
if (findings.length) throw new Error(`invalid evidence suite:\n- ${findings.join('\n- ')}`);
console.log(JSON.stringify({ suite: seedEvidenceSuite.id, scenes: seedEvidenceSuite.scenes.length, status: 'valid' }, null, 2));
