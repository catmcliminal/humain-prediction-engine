// Builds database.rules.json from database.rules.template.json (injects the freeze time).
// The generated file is git-ignored. Usage:  npm run rules:build
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
export const FREEZE_AT = 1798722000000;

export function buildRules({ freezeAt = FREEZE_AT } = {}) {
  const tpl = readFileSync(join(root, 'database.rules.template.json'), 'utf8');
  const out = tpl.replaceAll('__FREEZE_AT__', String(freezeAt));
  JSON.parse(out); // fail loudly on a broken template
  return out;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  writeFileSync(join(root, 'database.rules.json'), buildRules());
  console.log('Wrote database.rules.json (freeze at ' + FREEZE_AT + ')');
}
