import { ANSWER_WINDOW_MS, CORRECT_POINTS, FREEZE_AT, SPEED_BONUS_MAX } from './constants';
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

export interface BoardItem extends Prediction { id: string; author: string; color: string; will: number; wont: number; total: number; pct: number | null; cyber: number }

/** Predictions that may be shown: not hidden, and not flagged (unless the host restored them). */
export function board(s: GameState, isFlagged: (t: string) => boolean = () => false): BoardItem[] {
  return Object.entries(s.preds)
    .filter(([id, p]) => !s.hidden[id] && (p.seed || s.restored[id] || !isFlagged(p.text)))
    .map(([id, p]) => {
      const v = Object.values(s.votes[id] ?? {});
      const will = v.filter((x) => x === 'will').length, wont = v.length - will;
      const who = p.seed ? undefined : s.players[p.pid];
      return {
        id, ...p, author: p.seed ? 'humAIn seed' : who?.name ?? '???', color: who?.color ?? '#00e5ff',
        will, wont, total: v.length, pct: v.length ? Math.round((100 * will) / v.length) : null,
        cyber: Object.keys(s.tags[id] ?? {}).length,
      };
    });
}

export const newest = (items: BoardItem[]) => [...items].sort((a, b) => b.ts - a.ts);
/** "Rising": activity per minute of age, so a fresh prediction that is drawing votes comes up first. */
export const rising = (items: BoardItem[], now: number) => {
  const heat = (x: BoardItem) => (x.total + 2 * x.cyber) / (1 + (now - x.ts) / 60_000);
  return [...items].filter((x) => heat(x) > 0).sort((a, b) => heat(b) - heat(a));
};
export const topCyber = (items: BoardItem[], n = 5) => items.filter((x) => x.cyber > 0).sort((a, b) => b.cyber - a.cyber || b.ts - a.ts).slice(0, n);
