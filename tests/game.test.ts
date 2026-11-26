import { describe, expect, it } from 'vitest';
import { FREEZE_AT } from '../src/shared/constants';
import { leader, board, mythBusters, pointsFor, rising, stateAt, topCyber } from '../src/shared/game';
import { nameKey, callsignOk, cleanCallsign } from '../src/shared/text';
import { emptyState, type GameState } from '../src/shared/types';
import deck from '../content/deck.json';

const base = (): GameState => ({
  ...emptyState(),
  players: { a: { name: 'ANNA', color: '#39ff14' }, b: { name: 'BEN', color: '#39ff14' } },
  cards: { s: { text: 'solo', deck: 'arrival', order: 1 }, l: { text: 'live', deck: 'live', order: 1 } },
  keys: { s: { real: true, explainer: '' }, l: { real: false, explainer: '' } },
});

describe('state', () => {
  it('defaults to arrival and freezes at New Year whatever the host set', () => {
    const s = base();
    expect(stateAt(s, 0)).toBe('ARRIVAL');
    s.show = { name: 'PREDICT' };
    expect(stateAt(s, FREEZE_AT - 1)).toBe('PREDICT');
    expect(stateAt(s, FREEZE_AT)).toBe('FROZEN');
  });
});

describe('myth-buster scoring', () => {
  it('gives 100 for correct, plus up to 50 for speed in live rounds only', () => {
    expect(pointsFor(false, false, 0, 0)).toBe(0);
    expect(pointsFor(true, true, 99999, 1)).toBe(100);
    expect(pointsFor(true, false, 1000, 1000)).toBe(150);
    expect(pointsFor(true, false, 11000, 1000)).toBe(125);
    expect(pointsFor(true, false, 23000, 1000)).toBe(100);
  });
  it('counts only revealed cards', () => {
    const s = base();
    s.opened = { l: 1000 };
    s.answers = { s: { a: { a: 'real', ts: 5 } }, l: { b: { a: 'fake', ts: 1000 } } };
    expect(mythBusters(s).map((r) => r.points)).toEqual([0, 0]);
    s.revealed = { s: true, l: true };
    expect(mythBusters(s).map((r) => [r.name, r.points])).toEqual([['BEN', 150], ['ANNA', 100]]);
  });
});

describe('leader', () => {
  const item = (id: string, will: number, total: number, ts = 1) => ({ id, will, total, pct: total ? Math.round((100 * will) / total) : null, cyber: 0, ts }) as never;
  it('picks the most backed, then the higher share, and nothing until someone backs one', () => {
    expect(leader([item('a', 0, 3), item('b', 0, 0)])).toBeUndefined();
    expect(leader([item('a', 2, 5), item('b', 3, 6)])).toMatchObject({ id: 'b' });
    expect(leader([item('a', 2, 5), item('b', 2, 2)])).toMatchObject({ id: 'b' });
  });
});

describe('board', () => {
  const s = base();
  s.preds = { p: { pid: 'a', text: 'one', ts: 10 }, q: { pid: 'seed', seed: true, text: 'two', ts: 5 }, h: { pid: 'b', text: 'hidden', ts: 1 } };
  s.hidden = { h: true };
  s.votes = { q: { a: 'will', b: 'wont', c: 'will' } };
  s.tags = { p: { b: true } };
  it('works out percentages, seed authorship and hides moderated items', () => {
    const items = board(s);
    expect(items.map((x) => x.id)).toEqual(['p', 'q']);
    expect(items[1]).toMatchObject({ author: 'humAIn', pct: 67, total: 3 });
    expect(items[0].pct).toBeNull();
    expect(topCyber(items).map((x) => x.id)).toEqual(['p']);
    expect(rising(items, 60_000).length).toBe(2);
  });
});

describe('nicknames', () => {
  it('allow 2 to 20 characters and are unique without regard to case', () => {
    expect(callsignOk(cleanCallsign('x'.repeat(30)))).toBe(true);
    expect(cleanCallsign('x'.repeat(30))).toHaveLength(20);
    expect(nameKey('Bee.1')).toBe(nameKey('BEE.1'));
    expect(nameKey('A.B')).not.toMatch(/[.$#[\]/]/);
  });
});

describe('headline deck', () => {
  const entries = Object.entries(deck.key) as [string, { real: boolean; source?: string; seed?: string; seedText?: string; explainer: string }][];
  it('has the arrival, live and reserve cards with a source on every real one and a seed on every fake', () => {
    const decks = Object.values(deck.cards).map((c) => c.deck);
    expect([decks.filter((d) => d === 'arrival').length, decks.filter((d) => d === 'live').length, decks.filter((d) => d === 'reserve').length]).toEqual([3, 6, 2]);
    for (const [, k] of entries) {
      if (k.real) expect(k.source).toMatch(/^https:/);
      else expect(k.seed && k.seedText).toBeTruthy();
    }
    expect(Object.keys(deck.seedIds)).toHaveLength(4);
  });
  it('contains no em dashes', () => { expect(JSON.stringify(deck)).not.toContain('—'); });
});
