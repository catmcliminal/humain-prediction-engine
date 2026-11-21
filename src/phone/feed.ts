import { MAX_PREDICTIONS_PER_PLAYER, POST_INTERVAL_MS } from '../shared/constants';
import type { DerivedPrediction, Player } from '../shared/types';

export type Sort = 'new' | 'top' | 'unrated';

/** Card ids in display order. UNRATED hides predictions the player wrote or has already rated. */
export function orderFeed(
  preds: DerivedPrediction[], sort: Sort, me: string, ratings: Record<string, Record<string, number>>,
): string[] {
  let list = [...preds];
  if (sort === 'new') list.sort((a, b) => b.ts - a.ts);
  else if (sort === 'top') list.sort((a, b) => b.votes - a.votes || b.ts - a.ts);
  else list = list.filter((p) => p.pid !== me && !ratings[p.id]?.[me]).sort((a, b) => b.ts - a.ts);
  return list.map((p) => p.id);
}

/** Whole seconds until the player may fire again (0 = ready). Uses server time. */
export const rateLimitLeft = (lastPost: number | undefined, now: number) =>
  lastPost ? Math.max(0, Math.ceil((lastPost + POST_INTERVAL_MS - now) / 1000)) : 0;

/** The player has used all their shots (the rules cap `count`; hidden shots still count). */
export const magazineEmpty = (player: Player | undefined, firedVisible = 0) =>
  (player?.count ?? 0) >= MAX_PREDICTIONS_PER_PLAYER || firedVisible >= MAX_PREDICTIONS_PER_PLAYER;

/** Ranks beyond the top 100 are shown as 100+. */
export const rankText = (rank: number) => (rank > 100 ? '100+' : `#${rank}`);
