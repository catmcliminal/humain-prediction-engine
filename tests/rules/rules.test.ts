import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { buildRules } from '../../scripts/build-rules.mjs';
import deck from '../../content/deck.json';

const G = 'games/g1';
const TS = { '.sv': 'timestamp' };
let live: RulesTestEnvironment; // freeze is in the future
let over: RulesTestEnvironment; // freeze is in the past

const db = (e: RulesTestEnvironment, uid?: string) => (uid ? e.authenticatedContext(uid) : e.unauthenticatedContext()).database();
const seed = (e: RulesTestEnvironment, data: Record<string, unknown>) =>
  e.withSecurityRulesDisabled(async (ctx) => { await ctx.database().ref().update(data); });
const base = (...uids: string[]) => ({
  ...Object.fromEntries(uids.flatMap((u) => [
    [`${G}/players/${u}`, { name: u.toUpperCase(), color: '#39ff14', ts: 1 }],
    [`${G}/joins/${u}`, { ok: true }],
  ])),
  [`${G}/cards`]: deck.cards, [`${G}/key`]: deck.key, [`${G}/seedIds`]: deck.seedIds,
  'secrets/hostWord': 'testword',
});
const asHost = (e: RulesTestEnvironment) => seed(e, { [`${G}/hosts/host`]: 'testword' });
const answer = (uid: string, card: string, e = live) =>
  db(e, uid).ref(G).update({ [`answers/${card}/${uid}`]: { a: 'real', ts: TS }, [`answered/${card}/${uid}`]: true });
const post = (uid: string, id: string, text = 'a perfectly valid prediction', e = live) =>
  db(e, uid).ref(G).update({ [`predictions/${id}`]: { pid: uid, text, ts: TS }, [`players/${uid}/lastPost`]: TS });
const state = (name: string, extra: Record<string, unknown> = {}) => seed(live, { [`${G}/show`]: { name, ...extra } });

beforeAll(async () => {
  live = await initializeTestEnvironment({ projectId: 'demo-pe27-live', database: { host: '127.0.0.1', port: 9000, rules: buildRules() } });
  over = await initializeTestEnvironment({ projectId: 'demo-pe27-over', database: { host: '127.0.0.1', port: 9000, rules: buildRules({ freezeAt: 1000 }) } });
});
afterAll(async () => { await live.cleanup(); await over.cleanup(); });
beforeEach(async () => {
  await live.clearDatabase(); await over.clearDatabase();
  await seed(live, base('alice', 'bob'));
});

describe('host word', () => {
  it('only the right word unlocks, and the secret cannot be read', async () => {
    await assertFails(db(live, 'alice').ref(`${G}/hosts/alice`).set('wrong'));
    await assertFails(db(live, 'alice').ref(`${G}/hosts/bob`).set('testword'));
    await assertFails(db(live, 'alice').ref('secrets/hostWord').get());
    await assertSucceeds(db(live, 'alice').ref(`${G}/hosts/alice`).set('testword'));
  });
  it('is needed to run the show or moderate', async () => {
    const a = db(live, 'alice');
    await assertFails(a.ref(`${G}/show/name`).set('PREDICT'));
    await assertFails(a.ref(`${G}/revealed/l1`).set(true));
    await assertFails(a.ref(`${G}/hidden/x`).set(true));
    await asHost(live);
    const h = db(live, 'host');
    await assertSucceeds(h.ref(G).update({ 'show/name': 'LIVE_QUIZ', 'show/card': 'l1', 'opened/l1': TS }));
    await assertSucceeds(h.ref(`${G}/revealed/l1`).set(true));
    await assertSucceeds(h.ref(`${G}/hidden/x`).set(true));
    await assertSucceeds(h.ref(`${G}/key`).get());
    await assertSucceeds(h.ref(G).update({ 'answers/l1': null, 'answered/l1': null, 'revealed/l1': null, 'opened/l1': null, 'show/card': null }));
  });
});

describe('answers stay secret', () => {
  it('no key before a reveal, except your own answered arrival card', async () => {
    const a = db(live, 'alice');
    await assertFails(a.ref(`${G}/key`).get());
    await assertFails(a.ref(`${G}/key/a1`).get());
    await assertSucceeds(answer('alice', 'a1'));
    await assertSucceeds(a.ref(`${G}/key/a1`).get());
    await assertFails(db(live, 'bob').ref(`${G}/key/a1`).get());
    await assertFails(db(live, 'bob').ref(`${G}/answers/a1`).get());
    await assertFails(db(live, 'bob').ref(`${G}/answers/a1/alice`).get());
    await assertSucceeds(a.ref(`${G}/answers/a1/alice`).get());
  });
  it('live answers: only the open card, in time, once, and the key waits for reveal', async () => {
    await assertFails(answer('alice', 'l1'));
    await state('LIVE_QUIZ', { card: 'l1' });
    await seed(live, { [`${G}/opened/l1`]: Date.now() });
    await assertFails(answer('alice', 'l2'));
    await assertSucceeds(answer('alice', 'l1'));
    await assertFails(answer('alice', 'l1'));
    await assertFails(db(live, 'alice').ref(`${G}/key/l1`).get());
    await seed(live, { [`${G}/revealed/l1`]: true });
    await assertSucceeds(db(live, 'alice').ref(`${G}/key/l1`).get());
    await assertSucceeds(db(live, 'bob').ref(`${G}/answers/l1`).get());
    await assertFails(answer('bob', 'l1'));
  });
  it('rejects a late answer, and arrival answers after arrival', async () => {
    await state('LIVE_QUIZ', { card: 'l1' });
    await seed(live, { [`${G}/opened/l1`]: Date.now() - 30_000 });
    await assertFails(answer('alice', 'l1'));
    await assertFails(answer('alice', 'a1'));
  });
  it('rejects unjoined players and a forged time', async () => {
    await assertFails(answer('carol', 'a1'));
    await assertFails(db(live, 'alice').ref(`${G}/answers/a1/alice`).set({ a: 'real', ts: 5 }));
  });
});

describe('predictions, votes and tags', () => {
  it('writing needs PREDICT, a cooldown and no links; there is no total limit', async () => {
    await assertFails(post('alice', 'p1'));
    await state('PREDICT');
    await assertFails(post('alice', 'p1', 'go to example.com now'));
    await assertFails(post('alice', 'p1', 'x'.repeat(141)));
    await assertSucceeds(post('alice', 'p1'));
    await assertFails(post('alice', 'p2'));
    await seed(live, { [`${G}/players/alice/lastPost`]: Date.now() - 16_000 });
    await assertSucceeds(post('alice', 'p2'));
    await assertFails(db(live, 'alice').ref(`${G}/predictions/p1/text`).set('edited afterwards'));
  });
  it('a prediction may carry the room marker, and nothing else', async () => {
    await state('PREDICT');
    const send = (uid: string, id: string, extra: object) => db(live, uid).ref(G).update({
      [`predictions/${id}`]: { pid: uid, text: 'a perfectly valid prediction', ts: TS, ...extra }, [`players/${uid}/lastPost`]: TS,
    });
    await assertFails(send('alice', 'p1', { room: 'yes' }));
    await assertFails(send('alice', 'p1', { approved: true }));
    await assertSucceeds(send('alice', 'p1', { room: true }));
    await assertFails(db(live, 'bob').ref(`${G}/restored/p1`).set(true));
  });
  it('vote on others only, change your mind, tag once', async () => {
    await state('PREDICT');
    await post('alice', 'p1');
    await assertFails(db(live, 'alice').ref(`${G}/votes/p1/alice`).set(4));
    await assertFails(db(live, 'alice').ref(`${G}/tags/p1/alice`).set(true));
    await assertSucceeds(db(live, 'bob').ref(`${G}/votes/p1/bob`).set(4));
    await assertSucceeds(db(live, 'bob').ref(`${G}/votes/p1/bob`).set(1));
    for (const bad of [true, 0, 6, 2.5, '3', 'will']) await assertFails(db(live, 'bob').ref(`${G}/votes/p1/bob`).set(bad));
    await assertSucceeds(db(live, 'bob').ref(`${G}/tags/p1/bob`).set(true));
    await assertSucceeds(db(live, 'bob').ref(`${G}/tags/p1/bob`).remove());
  });
  it('the follow-up vote on a seed works before PREDICT; only the host can create seeds', async () => {
    await assertSucceeds(db(live, 'bob').ref(`${G}/votes/seed-kq/bob`).set(4));
    await assertFails(db(live, 'bob').ref(`${G}/votes/made-up/bob`).set(4));
    const s = { pid: 'seed', seed: true, text: 'An AI creative director wins a Cannes Lion.', ts: TS };
    await assertFails(db(live, 'bob').ref(`${G}/predictions/seed-hn`).set(s));
    await asHost(live);
    await assertSucceeds(db(live, 'host').ref(`${G}/predictions/seed-hn`).set(s));
  });
});

describe('joining', () => {
  it('accepts 2 to 20 character nicknames once', async () => {
    const c = db(live, 'carol');
    const me = (name: string) => c.ref(`${G}/players/carol`).update({ name, color: '#39ff14', ts: TS });
    await assertFails(me('X'));
    await assertFails(me('X'.repeat(21)));
    await assertFails(me('<SCRIPT>'));
    await assertSucceeds(me('X'.repeat(20)));
    await assertFails(c.ref(`${G}/players/carol/name`).set('OTHER'));
    await assertFails(c.ref(`${G}/joins/carol`).set({ ok: true }));
  });
});

describe('after the New Year freeze', () => {
  it('every write and vote is refused', async () => {
    await seed(over, { ...base('alice', 'bob'), [`${G}/show`]: { name: 'PREDICT' }, [`${G}/hosts/host`]: 'testword', [`${G}/predictions/p1`]: { pid: 'alice', text: 'already here', ts: 1 } });
    await assertFails(post('bob', 'p2', 'a perfectly valid prediction', over));
    await assertFails(db(over, 'bob').ref(`${G}/votes/p1/bob`).set(4));
    await assertFails(db(over, 'bob').ref(`${G}/votes/seed-kq/bob`).set(4));
    await assertFails(db(over, 'bob').ref(`${G}/tags/p1/bob`).set(true));
    await assertFails(answer('bob', 'a1', over));
    await assertFails(db(over, 'host').ref(`${G}/show/name`).set('PREDICT'));
    await assertSucceeds(db(over, 'bob').ref(`${G}/predictions`).get());
  });
});
