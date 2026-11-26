import type { Database } from 'firebase-admin/database';
import { CALLSIGN_REJECTED, CALLSIGN_TAKEN } from '../../src/shared/constants';
import { makeFlagger } from '../../src/shared/flagger';
import { callsignOk, cleanCallsign, nameKey } from '../../src/shared/text';
import type { FlagList } from '../../src/shared/types';
import flagList from '../../src/shared/flagwords.json';

export const isFlagged = makeFlagger(flagList as FlagList);

/** New prediction: on a flag-list match, hide it and queue it for the host. A host RESTORE is never overwritten. */
export async function flagPrediction(db: Database, game: string, id: string, text: unknown, now = Date.now()) {
  if (!isFlagged(text)) return false;
  await db.ref(`games/${game}`).update({ [`hidden/${id}`]: true, [`flags/${id}`]: { ts: now } });
  return true;
}

/**
 * Join approval. A phone writes its own nickname; this checks it against the flag list and reserves it
 * (case-insensitive, one owner). A refused nickname is removed so the player can try another.
 */
export async function approvePlayer(db: Database, game: string, uid: string, now = Date.now()): Promise<'ok' | 'rejected' | 'none'> {
  const p = (await db.ref(`games/${game}/players/${uid}`).get()).val();
  if (typeof p?.name !== 'string') return 'none';
  let why: string | null = !callsignOk(p.name) || cleanCallsign(p.name) !== p.name || isFlagged(p.name) ? CALLSIGN_REJECTED : null;
  if (!why) {
    const claim = await db.ref(`games/${game}/names/${nameKey(p.name)}`).transaction((owner) => (owner === null || owner === uid ? uid : undefined));
    if (!claim.committed || claim.snapshot.val() !== uid) why = CALLSIGN_TAKEN;
  }
  if (why) {
    await db.ref(`games/${game}`).update({
      [`players/${uid}/name`]: null, [`players/${uid}/color`]: null, [`players/${uid}/ts`]: null,
      [`joins/${uid}`]: { rejected: why, ts: now },
    });
    return 'rejected';
  }
  await db.ref(`games/${game}/joins/${uid}`).set({ ok: true, ts: now });
  return 'ok';
}
