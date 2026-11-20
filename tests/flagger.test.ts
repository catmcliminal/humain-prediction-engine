import { describe, expect, it } from 'vitest';
import list from '../src/shared/flagwords.json';
import { makeFlagger } from '../src/shared/flagger';
import type { FlagList } from '../src/shared/types';

const isFlagged = makeFlagger(list as FlagList);

describe('flag matcher: catches', () => {
  it.each([
    ['plain slur', 'what a nigger'],
    ['upper case', 'KIKE'],
    ['spaced out', 'n i g g e r'],
    ['dotted', 'k.i.k.e'],
    ['number for letter', 'n1gger'],
    ['symbol for letter', 'f@ggot'],
    ['dollar for s', 'cun7 and wh0re'],
    ['repeated letters', 'niiiiigger'],
    ['accents stripped', 'nìgger'],
    ['suffix form', 'faggots everywhere'],
    ['phrase', 'the great replacement is real'],
    ['phrase with punctuation', 'white-power!'],
    ['phrase spaced', 'jewish   question'],
    ['number code', '1488'],
    ['symbol, raw', 'look (((them)))'],
    ['swastika', '卐'],
    ['slur in a sentence', 'In 2027 the model calls everyone a chink'],
  ])('%s', (_n, text) => expect(isFlagged(text)).toBe(true));

  it('catches a slur used as a callsign', () => {
    expect(isFlagged('NIGGER')).toBe(true);
    expect(isFlagged('N1GG3R')).toBe(true);
  });
});

describe('flag matcher: never flags identity words on their own', () => {
  it.each(['Jew', 'jewish', 'Jews', 'Muslim', 'Islam', 'Black', 'gay', 'trans', 'queer', 'Aboriginal', 'Indigenous', 'Asian', 'lesbian', 'disabled', 'autistic', 'Israeli', 'Hebrew', 'Yiddish'])(
    '%s', (w) => {
      expect(isFlagged(w)).toBe(false);
      expect(isFlagged(`A ${w} founder builds a model`)).toBe(false);
    });
  it('still catches hate phrases that start with an allowlisted identity word', () => {
    for (const t of ['the jewish media', 'jews control banks', 'J E W I S H  Q U E S T I O N']) expect(isFlagged(t)).toBe(true);
  });
  it('lets a good-faith sentence about a group through', () => {
    expect(isFlagged('A Muslim-founded lab, a Black CEO and a gay trans head of AI win a Nobel')).toBe(false);
  });
});

describe('flag matcher: allowlist', () => {
  it.each(['Scunthorpe', 'a spokesperson said', 'krautrock revival', 'cockatoo', 'raccoon', 'cocoon', 'tycoon', 'Fagin', 'slanted headlines', 'anti-nazi march', 'Nazi Germany'])(
    '%s', (t) => expect(isFlagged(t)).toBe(false));
});

describe('flag matcher: ordinary predictions stay clean', () => {
  const seeds = [
    'Most big Australian agencies have an AI operations lead on the exec team',
    'A model declares itself a sovereign nation and applies to join the UN',
    'AGI arrives, reads the terms and conditions, and logs off',
    "Someone's toaster gets a book deal",
    'Agents form their own union and demand GPU time off',
    'A frontier lab opens a church. Not a metaphor.',
    'The moon gets a data centre and an influencer',
    'A model files a copyright claim against the humans it was trained on',
    'Two agents negotiate a major media merger with no humans in the room',
    'Kids start talking in prompt syntax at the dinner table',
    'In 2027 Claude passes the bar, then a Black Friday sale',
  ];
  it.each(seeds)('%s', (t) => expect(isFlagged(t)).toBe(false));
});

describe('flag matcher: robustness', () => {
  it('handles empty, null and undefined', () => {
    expect(isFlagged('')).toBe(false);
    expect(isFlagged(null)).toBe(false);
    expect(isFlagged(undefined)).toBe(false);
  });
});
