// Seeds the local Database emulator with bot players and predictions so the UI has something to show.
// Usage: node scripts/seed-emulator.mjs [gameId]   (emulators must be running)
import { initializeApp } from 'firebase-admin/app';
import { getDatabase } from 'firebase-admin/database';

process.env.FIREBASE_DATABASE_EMULATOR_HOST = '127.0.0.1:9000';
import { readFileSync } from 'node:fs';
// The Functions emulator and the web app use the "demo-pe27" namespace, which the emulator starts with open
// rules. Load the real rules into it so the local app is tested under the same security rules as production.
const rules = await fetch('http://127.0.0.1:9000/.settings/rules.json?ns=demo-pe27', {
  method: 'PUT', headers: { Authorization: 'Bearer owner' }, body: readFileSync(new URL('../database.rules.json', import.meta.url)),
});
if (!rules.ok) throw new Error('could not load rules: ' + (await rules.text()));
const game = process.argv[2] ?? 'ai-2027';
const db = getDatabase(initializeApp({ projectId: 'demo-pe27', databaseURL: 'http://127.0.0.1:9000?ns=demo-pe27' }));
const colors = ['#39ff14', '#00e5ff', '#ffe600', '#ff8a00', '#ff2bd6', '#b388ff'];
const names = ['PIXELPUNK', 'NEONCMO', 'GPU_GRAN', 'BYTEME', 'DEEPFRIED', 'PROMPTQUEEN', 'ZEROSHOT', 'HALLUCIN8'];
const texts = [
  [1, 'Meetings get AI summaries by default'], [1, 'More companies write an AI policy'], [2, 'Most banks run an AI agent for basic support'],
  [2, 'Half of all code at big companies is AI written'], [3, 'An AI wins a major scientific prize'], [3, 'A chatbot becomes the most used news source'],
  [4, 'A country appoints an AI as a government advisor'], [4, 'AI agents negotiate our salaries'], [5, 'A bank chatbot asks for a pay rise'],
  [5, 'My fridge files a complaint with the council'], [5, 'An AI runs for mayor and wins'],
];
const u = {};
const now = Date.now();
names.forEach((n, i) => { u[`players/bot${i}`] = { name: n, color: colors[i % 6], ts: now - 600000 + i * 1000 }; });
texts.forEach(([tag, text], i) => {
  const id = `seed${i}`;
  u[`predictions/${id}`] = { pid: `bot${i % names.length}`, text, tag, ts: now - (texts.length - i) * 20000 };
  for (let k = 0; k < (i * 3) % 7; k++) u[`votes/${id}/bot${(i + k + 1) % names.length}`] = true;
  for (let k = 0; k < 3; k++) u[`ratings/${id}/bot${(i + k + 2) % names.length}`] = Math.min(6, Math.max(1, tag + (k - 1)));
});
await db.ref(`games/${game}`).update(u);
await db.ref('config/activeGame').set(game);
console.log(`seeded ${texts.length} predictions into games/${game}`);
process.exit(0);
