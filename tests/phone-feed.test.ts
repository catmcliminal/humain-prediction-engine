import { describe, expect, it } from 'vitest';
import { magazineEmpty, orderFeed, rankText, rateLimitLeft } from '../src/phone/feed';
import { derive } from '../src/shared/game';
import { emptyState } from '../src/shared/types';

const mk = () => {
  const s = emptyState();
  s.preds = {
    a: { pid: 'x', text: 'first prediction here', tag: 1, ts: 100 },
    b: { pid: 'x', text: 'second prediction here', tag: 2, ts: 200 },
    c: { pid: 'me', text: 'my own prediction here', tag: 3, ts: 300 },
    d: { pid: 'y', text: 'fourth prediction here', tag: 4, ts: 400 },
  };
  s.votes = { a: { u1: true, u2: true }, b: { u1: true } };
  return s;
};

describe('orderFeed', () => {
  it('NEWEST is newest first', () => {
    const s = mk();
    expect(orderFeed(derive(s).preds, 'new', 'me', s.ratings)).toEqual(['d', 'c', 'b', 'a']);
  });
  it('TOP is most votes first, newest breaks ties', () => {
    const s = mk();
    expect(orderFeed(derive(s).preds, 'top', 'me', s.ratings)).toEqual(['a', 'b', 'd', 'c']);
  });
  it('UNRATED drops my own and already-rated predictions', () => {
    const s = mk();
    s.ratings = { b: { me: 4 } };
    expect(orderFeed(derive(s).preds, 'unrated', 'me', s.ratings)).toEqual(['d', 'a']);
  });
  it('omits hidden predictions', () => {
    const s = mk();
    s.hidden = { d: true };
    expect(orderFeed(derive(s).preds, 'new', 'me', s.ratings)).toEqual(['c', 'b', 'a']);
  });
});

describe('rateLimitLeft', () => {
  it('counts down in whole seconds and never goes negative', () => {
    expect(rateLimitLeft(undefined, 5000)).toBe(0);
    expect(rateLimitLeft(1000, 1000)).toBe(15);
    expect(rateLimitLeft(1000, 4000)).toBe(12);
    expect(rateLimitLeft(1000, 4001)).toBe(12);
    expect(rateLimitLeft(1000, 16000)).toBe(0);
    expect(rateLimitLeft(1000, 99999)).toBe(0);
  });
});

describe('magazineEmpty', () => {
  it('is true at 10 shots, counting hidden ones', () => {
    expect(magazineEmpty(undefined)).toBe(false);
    expect(magazineEmpty({ name: 'A', color: '#fff', count: 9 })).toBe(false);
    expect(magazineEmpty({ name: 'A', color: '#fff', count: 10 })).toBe(true);
    expect(magazineEmpty({ name: 'A', color: '#fff', count: 3 }, 10)).toBe(true);
  });
});

describe('rankText', () => {
  it('shows 100+ beyond the top 100', () => {
    expect(rankText(1)).toBe('#1');
    expect(rankText(100)).toBe('#100');
    expect(rankText(101)).toBe('100+');
  });
});
