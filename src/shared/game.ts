import {
  CROWD_RATINGS_TO_OVERRULE, CYBER_AVG_MIN, CYBER_MIN, FLEET_MAX, LEVEL_CYBER, LEVEL_UP_VOTES,
  POINTS_PER_VOTE, RAID, SHOOT_DOWN_MIN,
} from './constants';
import type { DerivedPrediction, GameState } from './types';

const clamp = (n: number, a: number, b: number) => Math.max(a, Math.min(b, n));
const size = (o: object | undefined) => (o ? Object.keys(o).length : 0);

export interface DeriveOptions {
  /** Client-side pre-hide while the flag Function catches up. Overridden by a host RESTORE. */
  isFlagged?: (text: string) => boolean;
}

/** Pure scoring and classification. Hidden predictions are excluded everywhere; scrubbed ones are not. */
export function derive(s: GameState, opts: DeriveOptions = {}) {
  const preds: DerivedPrediction[] = [];
  for (const [id, p] of Object.entries(s.preds)) {
    if (s.hidden[id]) continue;
    if (opts.isFlagged && !s.restored[id] && opts.isFlagged(p.text)) continue;
    const votes = size(s.votes[id]);
    const rs = Object.values(s.ratings[id] ?? {});
    const crowd = rs.length ? rs.reduce((a, b) => a + b, 0) / rs.length : null;
    const useCrowd = rs.length >= CROWD_RATINGS_TO_OVERRULE;
    const lvl = useCrowd ? (crowd as number) : p.tag;
    const cyber = useCrowd && rs.filter((r) => r === 6).length >= CYBER_MIN && (crowd as number) >= CYBER_AVG_MIN;
    const row = cyber ? LEVEL_CYBER : clamp(Math.round(lvl), 1, 5);
    const downs = size(s.downs[id]);
    preds.push({
      id, ...p, ts: p.ts || 0, votes, downs, nr: rs.length, crowd, useCrowd, lvl, row,
      points: Math.round(votes * POINTS_PER_VOTE * lvl),
      reclass: useCrowd && row !== p.tag,
      lvup: votes >= LEVEL_UP_VOTES,
      shot: downs >= SHOOT_DOWN_MIN && downs > votes,
    });
  }
  const scores: Record<string, number> = {};
  for (const p of preds) scores[p.pid] = (scores[p.pid] ?? 0) + p.points;
  const board = Object.entries(s.players)
    .filter(([, pl]) => !(opts.isFlagged && opts.isFlagged(pl.name))) // a flagged callsign never shows until the server removes it
    .map(([pid, pl]) => ({ pid, ...pl, score: scores[pid] ?? 0 }))
    .sort((a, b) => b.score - a.score || (a.ts ?? 0) - (b.ts ?? 0)); // ties: earlier join ranks higher
  return { preds, board, scores };
}

/** Mothership: most-upvoted prediction, ties to the earliest. Needs at least one vote. */
export function leaderOf(preds: DerivedPrediction[]): DerivedPrediction | null {
  let best: DerivedPrediction | null = null;
  for (const p of preds) {
    if (p.votes > 0 && (!best || p.votes > best.votes || (p.votes === best.votes && p.ts < best.ts))) best = p;
  }
  return best;
}

/**
 * What the big screen shows: per row, up to FLEET_MAX cards sorted by votes then newest.
 * The mothership's prediction and scrubbed predictions are not in the rows.
 */
export function fleetRows(preds: DerivedPrediction[], scrubbed: Record<string, boolean>, leadId: string | null) {
  const rows: Record<number, { shown: DerivedPrediction[]; total: number }> = {};
  for (let r = 1; r <= LEVEL_CYBER; r++) {
    const list = preds
      .filter((p) => p.row === r && p.id !== leadId && !scrubbed[p.id])
      .sort((a, b) => b.votes - a.votes || b.ts - a.ts);
    rows[r] = { shown: list.slice(0, FLEET_MAX), total: list.length };
  }
  return rows;
}

export const onScreenIds = (preds: DerivedPrediction[], scrubbed: Record<string, boolean>, leadId: string | null) =>
  new Set(Object.values(fleetRows(preds, scrubbed, leadId)).flatMap((r) => r.shown.map((p) => p.id)));

/** Shoot-down rule: 3+ shoot-downs and more shoot-downs than upvotes. Only on-screen cards are targeted. */
export function shotTargets(preds: DerivedPrediction[], scrubbed: Record<string, boolean>, leadId: string | null) {
  const on = onScreenIds(preds, scrubbed, leadId);
  return preds.filter((p) => p.shot && !scrubbed[p.id] && on.has(p.id)).sort((a, b) => b.downs - a.downs || a.ts - b.ts);
}

/** Timed raid: oldest 0-vote prediction over RAID.minAge old, lowest row first. Only on-screen cards. */
export function raidTarget(
  preds: DerivedPrediction[], scrubbed: Record<string, boolean>, leadId: string | null, now: number,
): DerivedPrediction | null {
  const on = onScreenIds(preds, scrubbed, leadId);
  const c = preds.filter((p) => p.votes === 0 && !scrubbed[p.id] && now - p.ts > RAID.minAge && on.has(p.id));
  c.sort((a, b) => a.row - b.row || a.ts - b.ts);
  return c[0] ?? null;
}
