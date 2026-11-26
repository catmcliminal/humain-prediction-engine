import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { initializeApp } from 'firebase-admin/app';
import { getDatabase, type Database } from 'firebase-admin/database';
import { CALLSIGN_REJECTED, CALLSIGN_TAKEN } from '../../src/shared/constants';
import { approvePlayer, flagPrediction } from '../../functions/src/core';

process.env.FIREBASE_DATABASE_EMULATOR_HOST = '127.0.0.1:9000';
let db: Database;
const G = 'g1';
const get = async (path: string) => (await db.ref(`games/${G}/${path}`).get()).val();
const player = (uid: string, name: string) => db.ref(`games/${G}/players/${uid}`).set({ name, color: '#39ff14', ts: 1 });

beforeAll(() => {
  db = getDatabase(initializeApp({ projectId: 'demo-pe27-fn', databaseURL: 'http://127.0.0.1:9000?ns=demo-pe27-fn' }, 'fn-test'));
});
beforeEach(async () => { await db.ref().set(null); });

describe('flagPrediction', () => {
  it('leaves clean text alone and hides a match', async () => {
    expect(await flagPrediction(db, G, 'a', 'AI will write my emails for me', 1)).toBe(false);
    expect(await flagPrediction(db, G, 'b', 'the jewish question will be answered by AI', 1)).toBe(true);
    expect(await get('hidden')).toEqual({ b: true });
  });
});

describe('approvePlayer', () => {
  it('approves a clean nickname and refuses the same one for someone else', async () => {
    await player('u1', 'BEE.1');
    expect(await approvePlayer(db, G, 'u1')).toBe('ok');
    expect(await approvePlayer(db, G, 'u1')).toBe('ok');
    await player('u2', 'BEE.1');
    expect(await approvePlayer(db, G, 'u2')).toBe('rejected');
    expect(await get('joins/u2/rejected')).toBe(CALLSIGN_TAKEN);
    expect(await get('players/u2/name')).toBeNull();
  });
  it('refuses a flagged nickname', async () => {
    await player('u3', 'N1GGER');
    expect(await approvePlayer(db, G, 'u3')).toBe('rejected');
    expect(await get('joins/u3/rejected')).toBe(CALLSIGN_REJECTED);
  });
});
