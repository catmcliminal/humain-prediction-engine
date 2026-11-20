import { initializeApp } from 'firebase-admin/app';
import { getDatabase } from 'firebase-admin/database';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { onValueCreated } from 'firebase-functions/v2/database';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { RAID } from '../../src/shared/constants';
import { activeGame, flagPrediction, joinPlayer, JoinError, scrubPass } from './core';

initializeApp();
// Realtime Database has no Sydney region; Singapore is the closest. Database-triggered Functions must sit in the
// database's region. The emulator assumes us-central1, so it is used there only.
const region = process.env.FUNCTIONS_EMULATOR ? 'us-central1' : 'asia-southeast1';
const db = () => getDatabase();
// App Check is enforced in the cloud; the Functions emulator does not issue App Check tokens.
const enforceAppCheck = !process.env.FUNCTIONS_EMULATOR;

export const onPredictionCreated = onValueCreated({ ref: '/games/{game}/predictions/{id}', region }, async (e) => {
  await flagPrediction(db(), e.params.game, e.params.id, e.data.val()?.text);
});

export const onShootDown = onValueCreated({ ref: '/games/{game}/downs/{pred}/{uid}', region }, async (e) => {
  await scrubPass(db(), e.params.game, Date.now(), { raid: false });
});

/** Timed raid every RAID.every ms (3 min). Also sweeps shoot-downs in case a card moved on screen since. */
export const timedRaid = onSchedule({ schedule: `every ${RAID.every / 60_000} minutes`, region }, async () => {
  const game = await activeGame(db());
  if (game) await scrubPass(db(), game, Date.now(), { raid: true });
});

export const join = onCall({ region, enforceAppCheck }, async (req) => {
  if (!req.auth) throw new HttpsError('unauthenticated', 'SIGN IN FIRST');
  const { game, name, color } = (req.data ?? {}) as { game?: unknown; name?: unknown; color?: unknown };
  if (typeof game !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(game)) throw new HttpsError('invalid-argument', 'BAD GAME');
  try {
    return await joinPlayer(db(), game, req.auth.uid, name, color);
  } catch (err) {
    if (err instanceof JoinError) throw new HttpsError(err.code, err.message);
    throw err;
  }
});
