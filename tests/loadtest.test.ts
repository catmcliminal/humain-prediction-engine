import { describe, expect, it } from 'vitest';
import { evaluate, makePrediction, percentile, rng, summarize, type Report } from '../scripts/loadtest/lib';
import { makeFlagger } from '../src/shared/flagger';
import flagList from '../src/shared/flagwords.json';
import { hasUrl, predictionError } from '../src/shared/text';
import type { FlagList } from '../src/shared/types';

describe('percentile', () => {
  it('uses nearest-rank', () => {
    const v = Array.from({ length: 100 }, (_, i) => i + 1);
    expect(percentile(v, 50)).toBe(50);
    expect(percentile(v, 95)).toBe(95);
    expect(percentile(v, 100)).toBe(100);
    expect(percentile([7], 95)).toBe(7);
    expect(percentile([], 95)).toBeNaN();
  });
  it('does not need sorted input', () => expect(percentile([5, 1, 9, 3], 50)).toBe(3));
});

describe('generated predictions', () => {
  const flagged = makeFlagger(flagList as FlagList);
  it('are always valid, link-free and never flagged', () => {
    const r = rng(1);
    for (let i = 0; i < 5000; i++) {
      const t = makePrediction(r);
      expect(predictionError(t), t).toBeNull();
      expect(hasUrl(t), t).toBe(false);
      expect(flagged(t), t).toBe(false);
    }
  });
  it('repeat for the same seed', () => expect(makePrediction(rng(42))).toBe(makePrediction(rng(42))));
});

const good: Report = {
  players: 300, minutes: 20, joined: 300, errors: 0, lost: 0,
  voteToScreen: summarize([100, 200, 300, 400, 1400]), fireToScreen: summarize([100]),
};
describe('evaluate', () => {
  it('passes a clean full-size run', () => expect(evaluate(good)).toEqual({ pass: true, failures: [] }));
  it('fails when p95 is 1.5 s or more', () => {
    const r = evaluate({ ...good, voteToScreen: summarize([1500, 1500, 1500, 1500, 1500]) });
    expect(r.pass).toBe(false);
    expect(r.failures[0]).toMatch(/p95/);
  });
  it('fails on any error or lost write', () => {
    expect(evaluate({ ...good, errors: 1 }).pass).toBe(false);
    expect(evaluate({ ...good, lost: 1 }).pass).toBe(false);
  });
  it('fails a short or small run, and failed joins', () => {
    expect(evaluate({ ...good, players: 100, joined: 100 }).pass).toBe(false);
    expect(evaluate({ ...good, minutes: 5 }).pass).toBe(false);
    expect(evaluate({ ...good, joined: 299 }).pass).toBe(false);
  });
  it('fails when nothing reached the screen', () => expect(evaluate({ ...good, voteToScreen: summarize([]) }).pass).toBe(false));
});
