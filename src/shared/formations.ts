/**
 * Formations: predictions that share key words get a matching letter badge.
 * Links two predictions when they share 2+ key words or have Jaccard overlap >= 0.34.
 * Uses an inverted word index so only predictions that share a word are compared (HANDOFF.md).
 */
export const STOP = new Set(
  ('a an the and or of to in on for by with at from is are be will it its this that as into than then their they them our your his her who what when where how why not no all every most more some any one two first last new old get gets got make makes made over under after before just still also only even ai 2027 model models agent agents someone somebody people nobody something thing things year years half big top using uses use does doesn did would could should can has have had been being was were itself own').split(' '),
);

export const keywords = (t: string): Set<string> =>
  new Set(
    t.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/)
      .filter((w) => w.length > 2 && !STOP.has(w))
      .map((w) => w.replace(/(ing|ed|es|s)$/, ''))
      .filter((w) => w.length > 1 && !STOP.has(w)),
  );

export const FORMATION_COLOURS = ['#ff2bd6', '#00e5ff', '#ffe600', '#39ff14', '#ff8a00', '#b388ff', '#ff5f5f', '#7dffd4'];

export interface Formation { letter: string; color: string; ids: string[]; kw: string[] }

export function formations(preds: { id: string; text: string }[]): Formation[] {
  const T = preds.map((p) => keywords(p.text));
  const par = preds.map((_, i) => i);
  const find = (i: number): number => (par[i] === i ? i : (par[i] = find(par[i])));

  const index = new Map<string, number[]>();
  T.forEach((set, i) => set.forEach((w) => { let a = index.get(w); if (!a) index.set(w, (a = [])); a.push(i); }));
  const seen = new Set<number>(); // pair key i*N+j, so each candidate pair is compared once
  const N = preds.length;
  for (const list of index.values()) {
    for (let a = 0; a < list.length; a++) for (let b = a + 1; b < list.length; b++) {
      const i = list[a], j = list[b], key = i * N + j;
      if (seen.has(key)) continue;
      seen.add(key);
      let sh = 0; for (const w of T[i]) if (T[j].has(w)) sh++;
      const jac = sh / (T[i].size + T[j].size - sh || 1);
      if (sh >= 2 || jac >= 0.34) par[find(i)] = find(j);
    }
  }
  const groups: Record<number, number[]> = {};
  preds.forEach((_, i) => (groups[find(i)] ??= []).push(i));
  return Object.values(groups)
    .filter((g) => g.length > 1)
    .sort((a, b) => b.length - a.length)
    .map((g, k) => {
      const cnt: Record<string, number> = {};
      g.forEach((i) => T[i].forEach((w) => (cnt[w] = (cnt[w] || 0) + 1)));
      const kw = Object.entries(cnt).filter(([, c]) => c > 1).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([w]) => w);
      return { letter: String.fromCharCode(65 + (k % 26)), color: FORMATION_COLOURS[k % FORMATION_COLOURS.length], ids: g.map((i) => preds[i].id), kw };
    });
}
