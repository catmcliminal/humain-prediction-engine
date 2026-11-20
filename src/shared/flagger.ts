import type { FlagList } from './types';

/**
 * Auto-flag matcher for flagwords.json. Follows the "matching" notes in that file:
 * lowercase, strip accents, map look-alikes (leet), collapse repeats (tested at 2 and at 1),
 * whole-word match with simple suffixes, phrases, compact (spaced-out) substrings,
 * raw symbols, and an allowlist that is never flagged.
 * Errs towards flagging: a false positive costs a host one click.
 * Identity words (Jew, Muslim, Black, gay, trans, Aboriginal...) are never flagged on their own.
 */
export function makeFlagger(L: FlagList): (text: unknown) => boolean {
  const leet = L.matching.leet;
  const plain = (s: string) => String(s).toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '');
  const norm = (s: string) => [...plain(s)].map((c) => leet[c] ?? c).join('');
  const letters = (s: string) => s.replace(/[^a-z]+/g, ' ').trim();
  const SUF = ['', 's', 'es', 'z', 'y', 'ie', 'ies', 'ed', 'ing'];

  const allow = L.allowlist.map((a) => letters(plain(a))).filter(Boolean);
  const words = new Set(L.words.flatMap((w) => SUF.map((x) => letters(norm(w)).replace(/ /g, '') + x)));
  const phrases = L.phrases.map((p) => ' ' + letters(norm(p)) + ' ');
  const compact = L.compact.map((c) => letters(norm(c)).replace(/ /g, '')).filter(Boolean);
  const runs2 = (s: string) => s.replace(/([a-z])\1{2,}/g, '$1$1'); // niiigger -> niigger
  const runs1 = (s: string) => s.replace(/([a-z])\1{2,}/g, '$1'); // niiigger -> nigger
  const allowRes = allow.map((a) => new RegExp(' ' + a.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?= )', 'g'));

  function hit(v: string): boolean {
    const full = ' ' + letters(v) + ' ';
    // Phrases and compact terms run on the text BEFORE the allowlist is applied. Several phrases
    // ("jewish media", "jews control") start with an allowlisted identity word, so stripping the
    // allowlist first would make them impossible to match. The allowlist only guards single words.
    if (phrases.some((p) => full.includes(p))) return true;
    if (compact.some((c) => full.replace(/ /g, '').includes(c))) return true;
    let t = full;
    for (const re of allowRes) t = t.replace(re, ' ');
    return t.split(' ').some((w) => w && words.has(w));
  }

  return function isFlagged(text: unknown): boolean {
    const raw = String(text ?? '');
    if (L.symbols.some((s) => raw.includes(s))) return true;
    const n = norm(raw);
    return hit(n) || hit(runs2(n)) || hit(runs1(n));
  };
}
