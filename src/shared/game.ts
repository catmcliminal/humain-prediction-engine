import { ANSWER_WINDOW_MS, CORRECT_POINTS, FINAL_MIN_RATINGS, FREEZE_AT, LEADER_MIN_RATINGS, SPEED_BONUS_MAX } from './constants';
import type { GameState, Prediction, StateName } from './types';

/** The state every screen shows. The New Year freeze wins over anything the host set. */
export const stateAt = (s: GameState, now: number): StateName => (now >= FREEZE_AT ? 'FROZEN' : s.show.name ?? 'ARRIVAL');

export const deckCards = (s: GameState, deck: 'arrival' | 'live' | 'reserve') =>
  Object.entries(s.cards).filter(([, c]) => c.deck === deck).sort((a, b) => a[1].order - b[1].order).map(([id, c]) => ({ id, ...c }));

/** Points for one answer. Live and reserve cards (host-led, with an opening time) earn a speed bonus. */
export function pointsFor(correct: boolean, solo: boolean, answeredAt: number, openedAt: number | undefined) {
  if (!correct) return 0;
  if (solo || !openedAt) return CORRECT_POINTS;
  const left = Math.min(1, Math.max(0, 1 - (answeredAt - openedAt) / ANSWER_WINDOW_MS));
  return CORRECT_POINTS + Math.round(SPEED_BONUS_MAX * left);
}

export interface Rank { pid: string; name: string; color: string; points: number; right: number }

/** Myth-buster table over revealed cards only, so nothing leaks before a reveal. */
export function mythBusters(s: GameState, isFlagged: (t: string) => boolean = () => false): Rank[] {
  const rows = new Map<string, Rank>();
  for (const [pid, p] of Object.entries(s.players)) {
    if (p.name && !isFlagged(p.name)) rows.set(pid, { pid, name: p.name, color: p.color, points: 0, right: 0 });
  }
  for (const id of Object.keys(s.revealed)) {
    const key = s.keys[id], card = s.cards[id];
    if (!key || !card) continue;
    for (const [pid, a] of Object.entries(s.answers[id] ?? {})) {
      const row = rows.get(pid);
      if (!row) continue;
      const ok = (a.a === 'real') === key.real;
      row.points += pointsFor(ok, card.deck === 'arrival', a.ts, s.opened[id]);
      if (ok) row.right += 1;
    }
  }
  return [...rows.values()].sort((a, b) => b.points - a.points || b.right - a.right || a.name.localeCompare(b.name));
}

/** total = ratings received; avg and level (the rounded average) are null until someone rates it. */
export interface BoardItem extends Prediction { id: string; author: string; color: string; total: number; avg: number | null; level: number | null; cyber: number; pending: boolean }

/** A public prediction (not from the room) that the host has neither approved nor hidden. */
export const awaiting = (s: GameState, id: string, p: Prediction) => !p.seed && !p.room && !s.restored[id] && !s.hidden[id];

/**
 * Predictions that may be shown: not hidden, and either a seed, approved by the host (restored), or posted in the
 * room and not flagged. Pass `me` to also include that player's own predictions still awaiting approval.
 */
export function board(s: GameState, isFlagged: (t: string) => boolean = () => false, me?: string): BoardItem[] {
  return Object.entries(s.preds)
    .filter(([id, p]) => !s.hidden[id] && (p.seed || s.restored[id] || (p.room ? !isFlagged(p.text) : !!me && p.pid === me)))
    .map(([id, p]) => {
      const v = Object.values(s.votes[id] ?? {});
      const rs = v.filter((x) => typeof x === 'number');
      const avg = rs.length ? rs.reduce((a: number, b) => a + b, 0) / rs.length : null;
      const who = p.seed ? undefined : s.players[p.pid];
      return {
        id, ...p, author: p.seed ? 'humAIn' : who?.name ?? '???', color: who?.color ?? '#00e5ff',
        total: rs.length, avg, level: avg === null ? null : Math.round(avg),
        cyber: Object.keys(s.tags[id] ?? {}).length,
        pending: awaiting(s, id, p),
      };
    });
}

export const newest = (items: BoardItem[]) => [...items].sort((a, b) => b.ts - a.ts);
/** "Rising": activity per minute of age, so a fresh prediction that is drawing votes comes up first. */
export const rising = (items: BoardItem[], now: number) => {
  const heat = (x: BoardItem) => (x.total + 2 * x.cyber) / (1 + (now - x.ts) / 60_000);
  return [...items].filter((x) => heat(x) > 0).sort((a, b) => heat(b) - heat(a));
};
/** The wildest prediction: highest average rating, then the most ratings. None until one has enough ratings. */
export const leader = (items: BoardItem[]) =>
  items.filter((x) => x.total >= LEADER_MIN_RATINGS).sort((a, b) => b.avg! - a.avg! || b.total - a.total || b.cyber - a.cyber || a.ts - b.ts)[0] as BoardItem | undefined;
/** Closest to CERTAIN first. */
export const mostLikely = (items: BoardItem[]) =>
  items.filter((x) => x.total >= FINAL_MIN_RATINGS).sort((a, b) => a.avg! - b.avg! || b.total - a.total || a.ts - b.ts);
export const topCyber = (items: BoardItem[], n = 5) => items.filter((x) => x.cyber > 0).sort((a, b) => b.cyber - a.cyber || b.ts - a.ts).slice(0, n);
