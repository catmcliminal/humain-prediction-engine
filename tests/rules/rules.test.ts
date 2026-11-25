import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { buildRules } from '../../scripts/build-rules.mjs';
import { hasUrl } from '../../src/shared/text';

const G = 'games/g1';
const TS = { '.sv': 'timestamp' };
let live: RulesTestEnvironment; // freeze is in the future
let over: RulesTestEnvironment; // freeze is in the past

const db = (e: RulesTestEnvironment, uid?: string) => (uid ? e.authenticatedContext(uid) : e.unauthenticatedContext()).database();
const seed = (e: RulesTestEnvironment, data: Record<string, unknown>) =>
  e.withSecurityRulesDisabled(async (ctx) => { await ctx.database().ref().update(data); });
const joined = (...uids: string[]) => Object.fromEntries(uids.flatMap((u) => [
  [`${G}/players/${u}`, { name: u.toUpperCase(), color: '#39ff14', ts: 1 }],
  [`${G}/joins/${u}`, { ok: true }],
]));
const post = (d: ReturnType<typeof db>, uid: string, id: string, fields: Record<string, unknown> = {}, count: number | null = 1) =>
  d.ref(G).update({
    [`predictions/${id}`]: { pid: uid, text: 'a perfectly valid prediction', tag: 3, ts: TS, ...fields },
    [`players/${uid}/lastPost`]: TS,
    ...(count === null ? {} : { [`players/${uid}/count`]: count }),
  });

beforeAll(async () => {
  live = await initializeTestEnvironment({ projectId: 'demo-pe27-live', database: { host: '127.0.0.1', port: 9000, rules: buildRules() } });
  over = await initializeTestEnvironment({ projectId: 'demo-pe27-over', database: { host: '127.0.0.1', port: 9000, rules: buildRules({ freezeAt: 1000 }) } });
});
afterAll(async () => { await live.cleanup(); await over.cleanup(); });
beforeEach(async () => { await live.clearDatabase(); await over.clearDatabase(); });

describe('reads', () => {
  it('require a signed-in user', async () => {
    await assertFails(db(live).ref(`${G}/predictions`).get());
    await assertFails(db(live).ref(`${G}/players`).get());
    await assertSucceeds(db(live, 'alice').ref(`${G}/predictions`).get());
    await assertSucceeds(db(live, 'alice').ref(`${G}/scrubbed`).get());
  });
  it('never expose hosts', async () => { await assertFails(db(live, 'alice').ref(`${G}/hosts`).get()); });
  it('deny anything outside the game schema', async () => {
    await assertFails(db(live, 'alice').ref('secrets').set('x'));
    await assertFails(db(live, 'alice').ref(`${G}/random`).set('x'));
  });
});

describe('players', () => {
  beforeEach(() => seed(live, joined('alice', 'bob')));
  it('callsign, colour and join time cannot be changed once set', async () => {
    const a = db(live, 'alice');
    await assertFails(a.ref(`${G}/players/alice/name`).set('HACKED'));
    await assertFails(a.ref(`${G}/players/alice/color`).set('#ffffff'));
    await assertFails(a.ref(`${G}/players/alice/ts`).set(5));
    await assertFails(a.ref(`${G}/players/alice`).set({ name: 'ALICE', color: '#39ff14' }));
  });
  it('lastPost must be the server time and belong to the player', async () => {
    await assertSucceeds(db(live, 'alice').ref(`${G}/players/alice/lastPost`).set(TS));
    await assertFails(db(live, 'bob').ref(`${G}/players/alice/lastPost`).set(TS));
    await assertFails(db(live, 'bob').ref(`${G}/players/bob/lastPost`).set(Date.now() + 1_000_000));
  });
  it('count can only step up by one, never reset', async () => {
    await seed(live, { [`${G}/players/alice/count`]: 5 });
    const a = db(live, 'alice');
    await assertFails(a.ref(`${G}/players/alice/count`).set(0));
    await assertFails(a.ref(`${G}/players/alice/count`).set(1));
    await assertFails(a.ref(`${G}/players/alice/count`).set(7));
    await assertSucceeds(a.ref(`${G}/players/alice/count`).set(6));
  });
  it('rejects unknown fields', async () => { await assertFails(db(live, 'alice').ref(`${G}/players/alice/admin`).set(true)); });
});

describe('joining (client writes the callsign, a Function approves it)', () => {
  const join = (d: ReturnType<typeof db>, uid: string, f: Record<string, unknown> = {}) =>
    d.ref(`${G}/players/${uid}`).update({ name: 'ACE PILOT', color: '#39ff14', ts: TS, ...f });
  it('lets a player create their own record once', async () => {
    await assertSucceeds(join(db(live, 'carol'), 'carol'));
    await assertFails(join(db(live, 'carol'), 'carol', { name: 'RENAMED' })); // already set
  });
  it('cannot create a record for someone else', async () => { await assertFails(join(db(live, 'mallory'), 'carol')); });
  it('refuses signed-out users', async () => { await assertFails(join(db(live), 'carol')); });
  it.each([['too short', 'A'], ['too long', 'ABCDEFGHIJKLM'], ['lowercase', 'ace'], ['symbols', 'ACE<script>'], ['empty', ''], ['with a newline', 'AB\nCD']])('refuses a callsign that is %s', async (_n, name) => {
    await assertFails(join(db(live, 'carol'), 'carol', { name }));
  });
  it('accepts the allowed characters', async () => { await assertSucceeds(join(db(live, 'carol'), 'carol', { name: 'A_B.C-1 2' })); });
  it('refuses a bad colour, a fake join time and extra fields', async () => {
    await assertFails(join(db(live, 'carol'), 'carol', { color: 'green' }));
    await assertFails(join(db(live, 'carol'), 'carol', { color: '#39ff14zzz' }));
    await assertFails(join(db(live, 'carol'), 'carol', { ts: 5 }));
    await assertFails(join(db(live, 'carol'), 'carol', { admin: true }));
  });
  it('is closed after the freeze', async () => { await assertFails(join(db(over, 'carol'), 'carol')); });
  it('cannot post, vote or rate until the Function has approved the callsign', async () => {
    await seed(live, { [`${G}/players/carol`]: { name: 'CAROL', color: '#39ff14', ts: 1 } }); // no joins/carol/ok
    await assertFails(post(db(live, 'carol'), 'carol', 'p1'));
  });
  it('the verdict path is readable only by its owner and writable by no client', async () => {
    await seed(live, { [`${G}/joins/carol`]: { ok: true } });
    await assertSucceeds(db(live, 'carol').ref(`${G}/joins/carol`).get());
    await assertFails(db(live, 'bob').ref(`${G}/joins/carol`).get());
    await assertFails(db(live, 'carol').ref(`${G}/joins/carol`).set({ ok: true }));
    await assertFails(db(live, 'bob').ref(`${G}/joins/bob`).set({ ok: true }));
  });
});

describe('predictions', () => {
  beforeEach(() => seed(live, joined('alice', 'bob')));

  it('accepts a valid post written with lastPost and count in one multi-path update', async () => {
    await assertSucceeds(post(db(live, 'alice'), 'alice', 'p1'));
  });
  it('refuses a post that does not update lastPost, or does not step count', async () => {
    const a = db(live, 'alice');
    await assertFails(a.ref(`${G}/predictions/p1`).set({ pid: 'alice', text: 'a perfectly valid prediction', tag: 3, ts: TS }));
    await assertFails(post(a, 'alice', 'p1', {}, null));
    await assertFails(post(a, 'alice', 'p1', {}, 3));
  });
  it('requires a joined player', async () => {
    await assertFails(post(db(live, 'carol'), 'carol', 'p1'));
  });
  it('cannot post as someone else', async () => {
    await assertFails(post(db(live, 'bob'), 'alice', 'p1'));
    await assertFails(post(db(live, 'bob'), 'bob', 'p1', { pid: 'alice' }));
  });

  describe('rate limit: one per 15 seconds', () => {
    it('refuses a second post 5 seconds after the first', async () => {
      await seed(live, { [`${G}/players/alice/lastPost`]: Date.now() - 5000, [`${G}/players/alice/count`]: 1 });
      await assertFails(post(db(live, 'alice'), 'alice', 'p2', {}, 2));
    });
    it('allows the next post once 15+ seconds have passed', async () => {
      await seed(live, { [`${G}/players/alice/lastPost`]: Date.now() - 16000, [`${G}/players/alice/count`]: 1 });
      await assertSucceeds(post(db(live, 'alice'), 'alice', 'p2', {}, 2));
    });
    it('cannot be dodged by posting under a second id with a stale lastPost', async () => {
      await assertSucceeds(post(db(live, 'alice'), 'alice', 'p1'));
      await assertFails(post(db(live, 'alice'), 'alice', 'p2', {}, 2));
    });
  });

  describe('cap: 10 predictions per player', () => {
    it('allows the 10th', async () => {
      await seed(live, { [`${G}/players/alice/lastPost`]: 1, [`${G}/players/alice/count`]: 9 });
      await assertSucceeds(post(db(live, 'alice'), 'alice', 'p10', {}, 10));
    });
    it('refuses the 11th, however count is written', async () => {
      await seed(live, { [`${G}/players/alice/lastPost`]: 1, [`${G}/players/alice/count`]: 10 });
      const a = db(live, 'alice');
      await assertFails(post(a, 'alice', 'p11', {}, 11));
      await assertFails(post(a, 'alice', 'p11', {}, 10));
      await assertFails(post(a, 'alice', 'p11', {}, 1)); // trying to reset the counter
    });
  });

  describe('text', () => {
    const t = (n: number) => 'x'.repeat(n);
    it.each([[7, false], [8, true], [140, true], [141, false], [0, false]])('length %i -> allowed %s', async (n, ok) => {
      const r = post(db(live, 'alice'), 'alice', 'p1', { text: t(n) });
      await (ok ? assertSucceeds(r) : assertFails(r));
    });
    it('refuses non-string text', async () => { await assertFails(post(db(live, 'alice'), 'alice', 'p1', { text: 12345678 })); });
  });

  describe('no URLs (rules and client agree)', () => {
    const table: [string, boolean][] = [
      ['check https://example.com now', true],
      ['see http://x', true],
      ['go to www.example.org today', true],
      ['openai.com will win everything', true],
      ['Model.AI takes over', true],
      ['the lab ships foo.io next year', true],
      ['AGI arrives and logs off', false],
      ['Costs rise. Then they fall.', false],
      ['Prices fall 3.5 percent in 2027', false],
      ['A.I. takes over the office', false],
      ['Agents negotiate a merger with no humans', false],
    ];
    it('catches a URL hidden after a line break', async () => {
      await assertFails(post(db(live, 'alice'), 'alice', 'p1', { text: 'harmless first line\nvisit openai.com now' }));
    });
    it.each(table)('%s -> url %s', async (text, isUrl) => {
      await live.clearDatabase(); await seed(live, joined('alice'));
      expect(hasUrl(text)).toBe(isUrl);
      const r = post(db(live, 'alice'), 'alice', 'p1', { text });
      await (isUrl ? assertFails(r) : assertSucceeds(r));
    });
  });

  describe('shape', () => {
    it.each([[0, false], [1, true], [5, true], [6, false], [2.5, false], ['3', false]])('tag %s -> allowed %s', async (tag, ok) => {
      const r = post(db(live, 'alice'), 'alice', 'p1', { tag });
      await (ok ? assertSucceeds(r) : assertFails(r));
    });
    it('players cannot tag CYBERBONKERS (6)', async () => { await assertFails(post(db(live, 'alice'), 'alice', 'p1', { tag: 6 })); });
    it('refuses a forged timestamp', async () => { await assertFails(post(db(live, 'alice'), 'alice', 'p1', { ts: Date.now() - 60_000 })); });
    it('refuses extra fields', async () => { await assertFails(post(db(live, 'alice'), 'alice', 'p1', { stats: { votes: 999 } })); });
    it('refuses overwriting or deleting an existing prediction', async () => {
      await seed(live, { [`${G}/predictions/p1`]: { pid: 'alice', text: 'original prediction', tag: 3, ts: 5 } });
      await assertFails(db(live, 'alice').ref(`${G}/predictions/p1/text`).set('edited prediction text'));
      await assertFails(db(live, 'alice').ref(`${G}/predictions/p1`).remove());
      await assertFails(db(live, 'bob').ref(`${G}/predictions/p1`).remove());
    });
  });
});

/* votes, shoot-downs and ratings share one shape */
describe.each([
  ['votes', true, [[true, true], [false, false], [1, false], ['yes', false]]],
  ['downs', true, [[true, true], [false, false], [1, false]]],
] as const)('%s', (node, _x, cases) => {
  beforeEach(() => seed(live, { ...joined('alice', 'bob'), [`${G}/predictions/p1`]: { pid: 'alice', text: 'original prediction', tag: 3, ts: 5 } }));
  it("a player can cast their own, but not someone else's", async () => {
    await assertSucceeds(db(live, 'bob').ref(`${G}/${node}/p1/bob`).set(true));
    await assertFails(db(live, 'bob').ref(`${G}/${node}/p1/alice`).set(true));
  });
  it('cannot be cast on your own prediction', async () => { await assertFails(db(live, 'alice').ref(`${G}/${node}/p1/alice`).set(true)); });
  it('can be withdrawn by the player who cast it', async () => {
    await seed(live, { [`${G}/${node}/p1/bob`]: true });
    await assertSucceeds(db(live, 'bob').ref(`${G}/${node}/p1/bob`).remove());
  });
  it('cannot be withdrawn on behalf of someone else', async () => {
    await seed(live, { [`${G}/${node}/p1/bob`]: true });
    await assertFails(db(live, 'alice').ref(`${G}/${node}/p1/bob`).remove());
  });
  it('require a joined player and an existing prediction', async () => {
    await assertFails(db(live, 'carol').ref(`${G}/${node}/p1/carol`).set(true));
    await assertFails(db(live, 'bob').ref(`${G}/${node}/ghost/bob`).set(true));
  });
  it('require authentication', async () => { await assertFails(db(live).ref(`${G}/${node}/p1/bob`).set(true)); });
  it.each(cases)('value %j -> allowed %s', async (value, ok) => {
    const r = db(live, 'bob').ref(`${G}/${node}/p1/bob`).set(value as never);
    await (ok ? assertSucceeds(r) : assertFails(r));
  });
});

describe('ratings', () => {
  beforeEach(() => seed(live, { ...joined('alice', 'bob'), [`${G}/predictions/p1`]: { pid: 'alice', text: 'original prediction', tag: 3, ts: 5 } }));
  it.each([[1, true], [5, true], [6, true], [0, false], [7, false], [3.5, false], ['4', false], [true, false]])('rating %j -> allowed %s', async (v, ok) => {
    const r = db(live, 'bob').ref(`${G}/ratings/p1/bob`).set(v as never);
    await (ok ? assertSucceeds(r) : assertFails(r));
  });
  it('can be changed', async () => {
    await seed(live, { [`${G}/ratings/p1/bob`]: 2 });
    await assertSucceeds(db(live, 'bob').ref(`${G}/ratings/p1/bob`).set(5));
  });
  it('cannot be deleted, rated on your own prediction, or cast for someone else', async () => {
    await seed(live, { [`${G}/ratings/p1/bob`]: 2 });
    await assertFails(db(live, 'bob').ref(`${G}/ratings/p1/bob`).remove());
    await assertFails(db(live, 'alice').ref(`${G}/ratings/p1/alice`).set(6));
    await assertFails(db(live, 'alice').ref(`${G}/ratings/p1/bob`).set(1));
  });
});

describe('freeze at midnight New Year\'s Eve', () => {
  const setup = () => seed(over, { ...joined('alice', 'bob'), [`${G}/predictions/p1`]: { pid: 'alice', text: 'original prediction', tag: 3, ts: 5 }, [`${G}/votes/p1/bob`]: true });
  it('refuses new predictions, votes, shoot-downs, ratings and un-votes', async () => {
    await setup();
    const b = db(over, 'bob');
    await assertFails(post(db(over, 'alice'), 'alice', 'p2'));
    await assertFails(b.ref(`${G}/votes/p1/bob`).remove());
    await assertFails(b.ref(`${G}/downs/p1/bob`).set(true));
    await assertFails(b.ref(`${G}/ratings/p1/bob`).set(4));
    await assertFails(db(over, 'alice').ref(`${G}/players/alice/lastPost`).set(TS));
  });
  it('does not stop moderating afterwards', async () => {
    await setup();
    const h = db(over, 'host1');
    await assertSucceeds(h.ref(`${G}/hidden/p1`).set(true));
    await assertSucceeds(h.ref(`${G}/restored/p1`).set(true));
  });
  it('the same writes succeed before the freeze', async () => {
    await seed(live, { ...joined('alice', 'bob'), [`${G}/predictions/p1`]: { pid: 'alice', text: 'original prediction', tag: 3, ts: 5 } });
    await assertSucceeds(db(live, 'bob').ref(`${G}/votes/p1/bob`).set(true));
    await assertSucceeds(post(db(live, 'alice'), 'alice', 'p2'));
  });
});

describe('moderation (no PIN: any signed-in visitor of #host can hide and restore)', () => {
  beforeEach(() => seed(live, { ...joined('alice'), [`${G}/predictions/p1`]: { pid: 'alice', text: 'original prediction', tag: 3, ts: 5 } }));
  it('signed-in users can hide, un-hide and restore', async () => {
    const h = db(live, 'host1');
    await assertSucceeds(h.ref(`${G}/hidden/p1`).set(true));
    await assertSucceeds(h.ref(`${G}/hidden/p1`).remove());
    await assertSucceeds(h.ref(`${G}/restored/p1`).set(true));
  });
  it('the host view\'s HIDE and RESTORE multi-path updates work', async () => {
    const h = db(live, 'host1');
    await assertSucceeds(h.ref(G).update({ 'hidden/p1': true, 'restored/p1': null }));
    await assertSucceeds(h.ref(G).update({ 'hidden/p1': null, 'restored/p1': true }));
  });
  it('signed-out visitors cannot hide or restore', async () => {
    await assertFails(db(live).ref(`${G}/hidden/p1`).set(true));
    await assertFails(db(live).ref(`${G}/restored/p1`).set(true));
  });
  it('hidden and restored only accept true', async () => {
    await assertFails(db(live, 'host1').ref(`${G}/hidden/p1`).set('x'));
    await assertFails(db(live, 'host1').ref(`${G}/restored/p1`).set(false));
  });
  it('flags are readable when signed in, and writable by nobody', async () => {
    await seed(live, { [`${G}/flags/p1`]: { ts: 1 } });
    await assertSucceeds(db(live, 'host1').ref(`${G}/flags`).get());
    await assertFails(db(live).ref(`${G}/flags`).get());
    await assertFails(db(live, 'host1').ref(`${G}/flags/p2`).set({ ts: 2 }));
  });
  it('scrubbed is server-only: no client can write it', async () => {
    await assertFails(db(live, 'alice').ref(`${G}/scrubbed/p1`).set(true));
    await assertFails(db(live, 'host1').ref(`${G}/scrubbed/p1`).set(true));
    await assertSucceeds(db(live, 'alice').ref(`${G}/scrubbed`).get());
  });
  it('has no host registry', async () => { await assertFails(db(live, 'host1').ref(`${G}/hosts/host1`).set('anything')); });
});
