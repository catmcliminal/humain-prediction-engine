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
async function call(token: string, data: unknown) {
  const r = await fetch(`http://127.0.0.1:5001/${PROJECT}/us-central1/join`, {
    method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: JSON.stringify({ data }),
  });
  return { status: r.status, body: (await r.json()) as any };
}
async function signIn() {
  const r = await fetch('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=x', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
  const j: any = await r.json();
  return { token: j.idToken as string, uid: j.localId as string };
}

describe('deployed function wrappers (emulated)', () => {
  it('join accepts a clean callsign and writes the player', async () => {
    const { token, uid } = await signIn();
    const r = await call(token, { game: 'e2e', name: 'ace', color: '#39ff14' });
    expect(r.status).toBe(200);
        expect((await admin.ref(`games/e2e/players/${uid}/name`).get()).val()).toBe('ACE');
  });
  it('join rejects a flagged callsign with the exact message', async () => {
    const { token } = await signIn();
    const r = await call(token, { game: 'e2e', name: 'N1GGER', color: '#39ff14' });
    expect(r.status).toBe(400);
    expect(r.body.error.message).toBe('CALLSIGN NOT ALLOWED. TRY ANOTHER.');
  });
  it('join refuses an unauthenticated call', async () => {
    const r = await fetch(`http://127.0.0.1:5001/${PROJECT}/us-central1/join`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ data: { game: 'e2e', name: 'ace', color: '#39ff14' } }) });
    expect(r.status).toBe(401);
  });
  it('a new flagged prediction is hidden and flagged by the trigger; a clean one is not', async () => {
    await admin.ref('games/e2e/predictions').update({
      bad: { pid: 'x', text: 'the jewish question will be answered', tag: 2, ts: Date.now() },
      ok: { pid: 'x', text: 'AI will do my taxes next year', tag: 2, ts: Date.now() },
    });
    expect(await wait(async () => (await admin.ref('games/e2e/hidden/bad').get()).val() === true)).toBe(true);
    expect((await admin.ref('games/e2e/flags/bad').get()).exists()).toBe(true);
    expect((await admin.ref('games/e2e/hidden/ok').get()).exists()).toBe(false);
  });
  it('the third shoot-down scrubs the prediction via the trigger', async () => {
    await admin.ref('games/e2e/predictions/target').set({ pid: 'x', text: 'AI will rule the whole planet', tag: 4, ts: Date.now() });
    for (const u of ['a', 'b', 'c']) await admin.ref(`games/e2e/downs/target/${u}`).set(true);
    expect(await wait(async () => (await admin.ref('games/e2e/scrubbed/target').get()).val() === true)).toBe(true);
  });
});
