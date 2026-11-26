// Loads the headline deck (content/deck.json) into the live game. Safe to re-run: it only replaces the deck.
//   npm run content            (live project, uses your firebase login)
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const game = process.env.GAME_ID || 'ai-2027';
const deck = JSON.parse(readFileSync(new URL('../content/deck.json', import.meta.url), 'utf8'));
const dir = mkdtempSync(join(tmpdir(), 'deck-'));
for (const [node, value] of Object.entries(deck)) {
  const file = join(dir, `${node}.json`);
  writeFileSync(file, JSON.stringify(value));
  execFileSync('npx', ['firebase', 'database:set', `/games/${game}/${node}`, file, '--project', 'predictionengine-46f43', '--force'], { stdio: 'inherit' });
}
