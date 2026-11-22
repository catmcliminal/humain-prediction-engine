import { PREDICTION_MAX, PREDICTION_MIN } from '../../src/shared/constants';

/** Pass criteria from the handoff: 300 players for 20 minutes, vote-to-screen p95 under 1.5 s, no errors. */
export const CRITERIA = { players: 300, minutes: 20, voteToScreenP95Ms: 1500, maxErrors: 0 } as const;

export function percentile(values: number[], p: number): number {
  if (!values.length) return NaN;
  const a = [...values].sort((x, y) => x - y);
  const i = Math.min(a.length - 1, Math.max(0, Math.ceil((p / 100) * a.length) - 1));
  return a[i];
}

export interface Summary { n: number; p50: number; p95: number; p99: number; max: number }
export const summarize = (v: number[]): Summary => ({
  n: v.length, p50: percentile(v, 50), p95: percentile(v, 95), p99: percentile(v, 99), max: v.length ? Math.max(...v) : NaN,
});

/** Small deterministic PRNG (mulberry32) so a run can be repeated with --seed. */
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export const pick = <T>(r: () => number, a: readonly T[]) => a[Math.floor(r() * a.length)];

const SUBJECTS = ['my toaster', 'a bank chatbot', 'the council', 'every airline', 'my accountant', 'a primary school', 'the tax office', 'my GP', 'a footy club', 'the weather bureau', 'my fridge', 'a mining company'];
const VERBS = ['negotiates', 'refuses to approve', 'writes a policy about', 'asks for a pay rise over', 'files a complaint about', 'runs a podcast on', 'goes on strike over', 'starts a newsletter about'];
const OBJECTS = ['my electricity plan', 'parking fines', 'lunch orders', 'the office thermostat', 'school pickup', 'meeting invites', 'long weekends', 'the group chat', 'quarterly targets', 'summer holidays'];
const TAILS = ['by March', 'before the election', 'and nobody notices', 'in 2027', 'twice a week', 'for fun', ''];

/** A valid prediction (8..140 chars, no links). Callers also check it against the flag list. */
export function makePrediction(r: () => number): string {
  const t = `${pick(r, SUBJECTS)} ${pick(r, VERBS)} ${pick(r, OBJECTS)} ${pick(r, TAILS)}`.trim().replace(/\s+/g, ' ');
  return t.slice(0, PREDICTION_MAX).padEnd(PREDICTION_MIN, '!');
}

export interface Report {
  players: number; minutes: number; joined: number; errors: number;
  voteToScreen: Summary; fireToScreen: Summary; lost: number;
}
export function evaluate(r: Report, c: { players: number; minutes: number; voteToScreenP95Ms: number; maxErrors: number } = CRITERIA) {
  const failures: string[] = [];
  if (r.players < c.players) failures.push(`players ${r.players} < ${c.players}`);
  if (r.minutes < c.minutes) failures.push(`duration ${r.minutes} min < ${c.minutes} min`);
  if (r.joined < r.players) failures.push(`only ${r.joined} of ${r.players} players joined`);
  if (!(r.voteToScreen.n > 0)) failures.push('no votes reached the screen');
  else if (!(r.voteToScreen.p95 < c.voteToScreenP95Ms)) failures.push(`vote-to-screen p95 ${Math.round(r.voteToScreen.p95)} ms >= ${c.voteToScreenP95Ms} ms`);
  if (r.errors + r.lost > c.maxErrors) failures.push(`${r.errors} errors and ${r.lost} writes never reached the screen (allowed ${c.maxErrors})`);
  return { pass: failures.length === 0, failures };
}
