// Builds database.rules.json from database.rules.template.json.
// The host PIN lives in the rules (the database checks it, not the page), so it is injected at build
// time and the generated file is git-ignored. Usage:  HOST_PIN='your-long-pin' npm run rules:build
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
export const FREEZE_AT = 1798722000000;

export function buildRules({ hostPin, freezeAt = FREEZE_AT } = {}) {
  if (!hostPin || typeof hostPin !== 'string') throw new Error('HOST_PIN is required');
  if (hostPin === 'CHANGE-THIS-PIN') throw new Error('HOST_PIN is still the placeholder');
  if (hostPin.length < 8) throw new Error('HOST_PIN must be at least 8 characters (anyone signed in can guess it)');
  if (/['"\\\s]/.test(hostPin)) throw new Error('HOST_PIN may not contain quotes, backslashes or spaces');
  const tpl = readFileSync(join(root, 'database.rules.template.json'), 'utf8');
  const out = tpl.replaceAll('__HOST_PIN__', hostPin).replaceAll('__FREEZE_AT__', String(freezeAt));
  JSON.parse(out); // fail loudly on a broken template
  return out;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  writeFileSync(join(root, 'database.rules.json'), buildRules({ hostPin: process.env.HOST_PIN }));
  console.log('Wrote database.rules.json (host PIN set, freeze at ' + FREEZE_AT + ')');
}
