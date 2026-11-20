import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { initializeApp } from 'firebase-admin/app';
import { getDatabase, type Database } from 'firebase-admin/database';
import { CALLSIGN_REJECTED, FREEZE_AT, RAID } from '../../src/shared/constants';
import { activeGame, flagPrediction, joinPlayer, JoinError, scrubPass } from '../../functions/src/core';

process.env.FIREBASE_DATABASE_EMULATOR_HOST = '127.0.0.1:9000';
let db: Database;
const G = 'g1';
const NOW = 1_790_000_000_000; // well before the freeze
const get = async (path: string) => (await db.ref(`games/${G}/${path}`).get()).val();

beforeAll(() => {
  const app = initializeApp({ projectId: 'demo-pe27-fn', databaseURL: 'http://127.0.0.1:9000?ns=demo-pe27-fn' }, 'fn-test');
  db = getDatabase(app);
});
beforeEach(async () => { await db.ref().set(null); });

let n = 0;
/** Seed a prediction with N votes, M shoot-downs and an age. */
async function seed(o: { id?: string; text?: string; tag?: number; votes?: number; downs?: number; ageMs?: number; ratings?: number[] }) {
  const id = o.id ?? `p${++n}`;
  const u: Record<string, unknown> = {
    [`predictions/${id}`]: { pid: 'author', text: o.text ?? `prediction number ${id} here`, tag: o.tag ?? 1, ts: NOW - (o.ageMs ?? 0) },
  };
  for (let i = 0; i < (o.votes ?? 0); i++) u[`votes/${id}/v${i}`] = true;
  for (let i = 0; i < (o.downs ?? 0); i++) u[`downs/${id}/d${i}`] = true;
  (o.ratings ?? []).forEach((r, i) => { u[`ratings/${id}/r${i}`] = r; });
  await db.ref(`games/${G}`).update(u);
  return id;
}

describe('flagPrediction', () => {
  it('writes nothing for a clean prediction', async () => {
    expect(await flagPrediction(db, G, 'a', 'AI will write my emails for me', NOW)).toBe(false);
    expect(await get('hidden')).toBeNull();
    expect(await get('flags')).toBeNull();
  });
  it('writes hidden/{id} and flags/{id} on a match', async () => {
    expect(await flagPrediction(db, G, 'a', 'the jewish question will be answered by AI', NOW)).toBe(true);
    expect(await get('hidden/a')).toBe(true);
    expect(await get('flags/a')).toEqual({ ts: NOW });
  });
  it('catches spaced-out terms and leaves identity words alone', async () => {
    expect(await flagPrediction(db, G, 'b', 'robots will be n i g g e r s one day', NOW)).toBe(true);
    expect(await flagPrediction(db, G, 'c', 'a Muslim and a gay Black trans Aboriginal founder build AI', NOW)).toBe(false);
  });
  it('ignores non-string text', async () => { expect(await flagPrediction(db, G, 'd', undefined, NOW)).toBe(false); });
});

describe('joinPlayer', () => {
  it('writes name, colour and join time', async () => {
    const r = await joinPlayer(db, G, 'u1', ' ace_pilot ', '#39ff14', NOW);
    expect(r).toEqual({ name: 'ACE_PILOT', color: '#39ff14', created: true });
    expect(await get('players/u1')).toEqual({ name: 'ACE_PILOT', color: '#39ff14', ts: NOW });
  });
  it('rejects a flagged callsign with the exact message and writes nothing', async () => {
    const err = await joinPlayer(db, G, 'u1', 'N1GGER', '#39ff14', NOW).catch((e) => e);
    expect(err).toBeInstanceOf(JoinError);
    expect(err.message).toBe(CALLSIGN_REJECTED);
    expect(err.code).toBe('invalid-argument');
    expect(await get('players')).toBeNull();
  });
  it('rejects spaced-out flagged callsigns', async () => {
    await expect(joinPlayer(db, G, 'u1', 'N I G G E R', '#39ff14', NOW)).rejects.toThrow(CALLSIGN_REJECTED);
  });
  it('rejects too-short, empty and non-string callsigns and bad colours', async () => {
    await expect(joinPlayer(db, G, 'u1', 'A', '#39ff14', NOW)).rejects.toBeInstanceOf(JoinError);
    await expect(joinPlayer(db, G, 'u1', '!!!', '#39ff14', NOW)).rejects.toBeInstanceOf(JoinError);
    await expect(joinPlayer(db, G, 'u1', 42, '#39ff14', NOW)).rejects.toBeInstanceOf(JoinError);
    await expect(joinPlayer(db, G, 'u1', 'ACE', 'red', NOW)).rejects.toBeInstanceOf(JoinError);
    await expect(joinPlayer(db, G, 'u1', 'ACE', undefined, NOW)).rejects.toBeInstanceOf(JoinError);
    expect(await get('players')).toBeNull();
  });
  it('is closed after the freeze', async () => {
    const err = await joinPlayer(db, G, 'u1', 'ACE', '#39ff14', FREEZE_AT).catch((e) => e);
    expect(err.code).toBe('failed-precondition');
    expect(await get('players')).toBeNull();
  });
  it('is idempotent and never renames or resets an existing player', async () => {
    await joinPlayer(db, G, 'u1', 'ACE', '#39ff14', NOW);
    await db.ref(`games/${G}/players/u1`).update({ lastPost: NOW, count: 3 });
    const r = await joinPlayer(db, G, 'u1', 'OTHER', '#ff2bd6', NOW + 1000);
    expect(r).toEqual({ name: 'ACE', color: '#39ff14', created: false });
    expect(await get('players/u1')).toEqual({ name: 'ACE', color: '#39ff14', ts: NOW, lastPost: NOW, count: 3 });
  });
});

describe('scrubPass: shoot-downs', () => {
  it('scrubs at 3 shoot-downs when they exceed upvotes', async () => {
    const shot = await seed({ downs: 3, votes: 2 });
    const kept = await seed({ downs: 3, votes: 3 });
    const few = await seed({ downs: 2, votes: 0 });
    expect(await scrubPass(db, G, NOW, { raid: false })).toEqual([shot]);
    expect(await get(`scrubbed/${shot}`)).toBe(true);
    expect(await get(`scrubbed/${kept}`)).toBeNull();
    expect(await get(`scrubbed/${few}`)).toBeNull();
  });
  it('does not raid when raid is false', async () => {
    await seed({ ageMs: RAID.minAge + 60_000 });
    expect(await scrubPass(db, G, NOW, { raid: false })).toEqual([]);
    expect(await get('scrubbed')).toBeNull();
  });
  it('leaves already-scrubbed predictions alone', async () => {
    const id = await seed({ downs: 4 });
    await scrubPass(db, G, NOW, { raid: false });
    expect(await scrubPass(db, G, NOW, { raid: false })).toEqual([]);
    expect(await get(`scrubbed/${id}`)).toBe(true);
  });
  it('ignores hidden predictions', async () => {
    const id = await seed({ downs: 4 });
    await db.ref(`games/${G}/hidden/${id}`).set(true);
    expect(await scrubPass(db, G, NOW, { raid: false })).toEqual([]);
  });
  it('ignores a flagged prediction until a host restores it', async () => {
    const id = await seed({ downs: 4, text: 'the jewish question will be answered' });
    expect(await scrubPass(db, G, NOW, { raid: false })).toEqual([]);
    await db.ref(`games/${G}/restored/${id}`).set(true);
    expect(await scrubPass(db, G, NOW, { raid: false })).toEqual([id]);
  });
  it('only targets cards that are on the big screen', async () => {
    for (let i = 0; i < 9; i++) await seed({ votes: 1, ageMs: i }); // 9 voted cards fill the row (one is the mothership)
    const off = await seed({ downs: 3, ageMs: 1000 });
    expect(await scrubPass(db, G, NOW, { raid: false })).toEqual([]);
    expect(await get(`scrubbed/${off}`)).toBeNull();
  });
});

describe('scrubPass: timed raid', () => {
  it('scrubs a 0-vote prediction older than 5 minutes', async () => {
    const old = await seed({ ageMs: RAID.minAge + 1000 });
    const young = await seed({ ageMs: RAID.minAge - 1000 });
    expect(await scrubPass(db, G, NOW, { raid: true })).toEqual([old]);
    expect(await get(`scrubbed/${young}`)).toBeNull();
  });
  it('never raids a prediction that has a vote', async () => {
    await seed({ ageMs: RAID.minAge * 3, votes: 1 });
    expect(await scrubPass(db, G, NOW, { raid: true })).toEqual([]);
  });
  it('raids one prediction per pass: lowest row first, then oldest', async () => {
    const row3 = await seed({ tag: 3, ageMs: RAID.minAge * 4 });
    const row1new = await seed({ tag: 1, ageMs: RAID.minAge + 1000 });
    const row1old = await seed({ tag: 1, ageMs: RAID.minAge + 9000 });
    expect(await scrubPass(db, G, NOW, { raid: true })).toEqual([row1old]);
    expect(await scrubPass(db, G, NOW, { raid: true })).toEqual([row1new]);
    expect(await scrubPass(db, G, NOW, { raid: true })).toEqual([row3]);
    expect(await scrubPass(db, G, NOW, { raid: true })).toEqual([]);
  });
  it('uses the crowd row, not the tag, once 3 ratings are in', async () => {
    const reclassed = await seed({ tag: 5, ratings: [1, 1, 1], ageMs: RAID.minAge + 1000 }); // crowd says row 1
    const plain = await seed({ tag: 2, ageMs: RAID.minAge + 9000 });
    expect(await scrubPass(db, G, NOW, { raid: true })).toEqual([reclassed]);
    expect(await get(`scrubbed/${plain}`)).toBeNull();
  });
  it('can shoot one card and raid another in the same pass', async () => {
    const shot = await seed({ downs: 3, tag: 4 });
    const raided = await seed({ tag: 1, ageMs: RAID.minAge + 1000 });
    expect((await scrubPass(db, G, NOW, { raid: true })).sort()).toEqual([shot, raided].sort());
  });
});

describe('after the freeze', () => {
  it('scrubs nothing', async () => {
    await seed({ downs: 5 });
    await seed({ ageMs: RAID.minAge * 2 });
    expect(await scrubPass(db, G, FREEZE_AT, { raid: true })).toEqual([]);
    expect(await get('scrubbed')).toBeNull();
  });
});

describe('activeGame', () => {
  it('reads config/activeGame and rejects junk', async () => {
    expect(await activeGame(db)).toBeNull();
    await db.ref('config/activeGame').set('nye-2026');
    expect(await activeGame(db)).toBe('nye-2026');
    await db.ref('config/activeGame').set('../bad path');
    expect(await activeGame(db)).toBeNull();
  });
});
