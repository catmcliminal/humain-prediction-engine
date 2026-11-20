import type { Database } from 'firebase-admin/database';
import { CALLSIGN_REJECTED, FREEZE_AT } from '../../src/shared/constants';
import { derive, leaderOf, raidTarget, shotTargets } from '../../src/shared/game';
import { makeFlagger } from '../../src/shared/flagger';
import { callsignOk, cleanCallsign } from '../../src/shared/text';
import { emptyState, type FlagList, type GameState } from '../../src/shared/types';
import flagList from '../../src/shared/flagwords.json';

export const isFlagged = makeFlagger(flagList as FlagList);

export class JoinError extends Error {
  constructor(public code: 'invalid-argument' | 'failed-precondition', message: string) {
    super(message);
  }
}

const rec = <T>(v: unknown): Record<string, T> => (v && typeof v === 'object' ? (v as Record<string, T>) : {});

/** Reads games/{game} with Admin privileges and maps it to the shared GameState. */
export async function loadState(db: Database, game: string): Promise<GameState> {
  const v = (await db.ref(`games/${game}`).get()).val() ?? {};
  return {
    ...emptyState(),
    players: rec(v.players), preds: rec(v.predictions), votes: rec(v.votes), ratings: rec(v.ratings),
    downs: rec(v.downs), hidden: rec(v.hidden), scrubbed: rec(v.scrubbed), restored: rec(v.restored),
  };
}

/**
 * (a) New prediction: on a flag-list match, write hidden/{id} and flags/{id}.
 * Hidden first, reviewed second. A host RESTORE (restored/{id}) is the host's call and is never overwritten.
 */
export async function flagPrediction(db: Database, game: string, id: string, text: unknown, now = Date.now()) {
  if (!isFlagged(text)) return false;
  await db.ref(`games/${game}`).update({ [`hidden/${id}`]: true, [`flags/${id}`]: { ts: now } });
  return true;
}

/** Join: callsign flag check (same matcher as predictions) and freeze check, then Admin write of name/color/ts. */
export async function joinPlayer(
  db: Database, game: string, uid: string, rawName: unknown, rawColor: unknown, now = Date.now(),
) {
  if (now >= FREEZE_AT) throw new JoinError('failed-precondition', 'GAME OVER');
  const name = cleanCallsign(typeof rawName === 'string' ? rawName : '');
  if (!callsignOk(name)) throw new JoinError('invalid-argument', 'CALLSIGN MUST BE 2-12 CHARACTERS');
  if (isFlagged(name)) throw new JoinError('invalid-argument', CALLSIGN_REJECTED);
  const color = typeof rawColor === 'string' && /^#[0-9a-fA-F]{6}$/.test(rawColor) ? rawColor : null;
  if (!color) throw new JoinError('invalid-argument', 'BAD COLOUR');

  const ref = db.ref(`games/${game}/players/${uid}`);
  const existing = (await ref.get()).val();
  if (existing?.name) return { name: existing.name as string, color: existing.color as string, created: false };
  await ref.update({ name, color, ts: now });
  return { name, color, created: true };
}

/**
 * (b) Scrub pass. Writes scrubbed/{id} ONLY when a rule is met:
 *   shoot-down: 3+ shoot-downs and more than upvotes (on-screen cards only)
 *   timed raid: oldest 0-vote card older than RAID.minAge, lowest row first (only when `raid` is true)
 * Uses the same derive/on-screen logic as the big screen. Does nothing after the freeze.
 */
export async function scrubPass(db: Database, game: string, now: number, opts: { raid: boolean }) {
  if (now >= FREEZE_AT) return [];
  const s = await loadState(db, game);
  const { preds } = derive(s, { isFlagged: (t) => isFlagged(t) });
  const leadId = leaderOf(preds)?.id ?? null;
  const ids = new Set(shotTargets(preds, s.scrubbed, leadId).map((p) => p.id));
  if (opts.raid) {
    const r = raidTarget(preds, s.scrubbed, leadId, now);
    if (r) ids.add(r.id);
  }
  if (ids.size) await db.ref(`games/${game}`).update(Object.fromEntries([...ids].map((id) => [`scrubbed/${id}`, true])));
  return [...ids];
}

/** The game the scheduled raid runs for. Set at config/activeGame (Admin/console only; clients have no access). */
export async function activeGame(db: Database): Promise<string | null> {
  const v = (await db.ref('config/activeGame').get()).val();
  return typeof v === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(v) ? v : null;
}
