import { describe, expect, it } from 'vitest';
import { formations, keywords } from '../src/shared/formations';

const P = (id: string, text: string) => ({ id, text });

describe('formations', () => {
  it('ignores stop words and generic terms (AI, 2027, model, agent)', () => {
    expect([...keywords('AI agents in 2027: the model will')]).toEqual([]);
  });
  it('groups predictions sharing 2+ key words', () => {
    const f = formations([P('1', 'Publishers lose search traffic'), P('2', 'Search traffic collapses for publishers'), P('3', 'Toaster gets a book deal')]);
    expect(f).toHaveLength(1);
    expect(f[0].ids.sort()).toEqual(['1', '2']);
    expect(f[0].letter).toBe('A');
    expect(f[0].kw.length).toBeGreaterThan(0);
  });
  it('does not group on a single shared word below the overlap threshold', () => {
    const f = formations([P('1', 'Toaster publishes novel about gardening'), P('2', 'Publishers adopt vertical video everywhere soon')]);
    expect(f).toHaveLength(0);
  });
  it('orders groups largest first and letters them A, B...', () => {
    const f = formations([
      P('1', 'Voice agents answer customer service calls'), P('2', 'Customer service calls answered by voice'), P('3', 'Voice customer service calls rise'),
      P('4', 'Mascot sues brand lawyers'), P('5', 'Brand mascot sues lawyers again'),
    ]);
    expect(f.map((g) => g.ids.length)).toEqual([3, 2]);
    expect(f.map((g) => g.letter)).toEqual(['A', 'B']);
  });
  it('scales: 3000 predictions compare quickly via the inverted index', () => {
    const preds = Array.from({ length: 3000 }, (_, i) => P(String(i), `unique${i}x thing${i % 50}y word${i % 7}z extra${i % 13}q`));
    const t = performance.now(); formations(preds);
    expect(performance.now() - t).toBeLessThan(5000);
  });
});
