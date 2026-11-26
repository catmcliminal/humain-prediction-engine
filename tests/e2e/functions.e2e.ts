import { describe, expect, it } from 'vitest';
import { initializeApp as initAdmin } from 'firebase-admin/app';
import { getDatabase } from 'firebase-admin/database';

// Runs against the Functions + Database + Auth emulators (npm run test:functions).
const PROJECT = 'demo-pe27';
const admin = getDatabase(initAdmin({ projectId: PROJECT, databaseURL: `http://127.0.0.1:9000?ns=${PROJECT}` }, 'e2e'));
const wait = async (fn: () => Promise<boolean>, ms = 15000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) { if (await fn()) return true; await new Promise((r) => setTimeout(r, 250)); }
  return false;
};
describe('deployed function wrappers (emulated)', () => {
  it('a clean callsign is approved by the trigger', async () => {
    await admin.ref('games/e2e/players/u1').set({ name: 'ACE', color: '#39ff14', ts: Date.now() });
    expect(await wait(async () => (await admin.ref('games/e2e/joins/u1/ok').get()).val() === true)).toBe(true);
  });
  it('a flagged callsign is removed and rejected with the exact message', async () => {
    await admin.ref('games/e2e/players/u2').set({ name: 'N1GGER', color: '#39ff14', ts: Date.now() });
    expect(await wait(async () => (await admin.ref('games/e2e/joins/u2/rejected').get()).exists())).toBe(true);
    expect((await admin.ref('games/e2e/joins/u2/rejected').get()).val()).toBe('NICKNAME NOT ALLOWED. TRY ANOTHER.');
    expect((await admin.ref('games/e2e/players/u2/name').get()).exists()).toBe(false);
  });
  it('a new flagged prediction is hidden and flagged by the trigger; a clean one is not', async () => {
    await admin.ref('games/e2e/predictions').update({
      bad: { pid: 'x', text: 'the jewish question will be answered', ts: Date.now() },
      ok: { pid: 'x', text: 'AI will do my taxes next year', ts: Date.now() },
    });
    expect(await wait(async () => (await admin.ref('games/e2e/hidden/bad').get()).val() === true)).toBe(true);
    expect((await admin.ref('games/e2e/flags/bad').get()).exists()).toBe(true);
    expect((await admin.ref('games/e2e/hidden/ok').get()).exists()).toBe(false);
  });
});
