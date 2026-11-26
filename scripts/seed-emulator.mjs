// Loads the real rules, the headline deck and a test host word into the local emulator.
// Usage: npm run seed   (emulators must be running). The host word here is for local testing only.
import { readFileSync } from 'node:fs';
import { initializeApp } from 'firebase-admin/app';
import { getDatabase } from 'firebase-admin/database';

process.env.FIREBASE_DATABASE_EMULATOR_HOST = '127.0.0.1:9000';
// The "demo-pe27" namespace starts with open rules; load the real ones so the local app is tested under them.
const rules = await fetch('http://127.0.0.1:9000/.settings/rules.json?ns=demo-pe27', {
  method: 'PUT', headers: { Authorization: 'Bearer owner' }, body: readFileSync(new URL('../database.rules.json', import.meta.url)),
});
if (!rules.ok) throw new Error('could not load rules: ' + (await rules.text()));
const game = process.argv[2] ?? 'ai-2027';
const deck = JSON.parse(readFileSync(new URL('../content/deck.json', import.meta.url), 'utf8'));
const db = getDatabase(initializeApp({ projectId: 'demo-pe27', databaseURL: 'http://127.0.0.1:9000?ns=demo-pe27' }));
await db.ref().set({ secrets: { hostWord: 'localtest' }, games: { [game]: deck } });
console.log(`seeded rules and deck into games/${game}`);
process.exit(0);
