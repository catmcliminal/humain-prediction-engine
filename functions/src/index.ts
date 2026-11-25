import { initializeApp } from 'firebase-admin/app';
import { getDatabase } from 'firebase-admin/database';
import { onValueCreated } from 'firebase-functions/v2/database';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { RAID } from '../../src/shared/constants';
import { activeGame, approvePlayer, flagPrediction, scrubPass } from './core';

initializeApp();
// Realtime Database has no Sydney region; Singapore is the closest. Database-triggered Functions must sit in the
// database's region. The emulator assumes us-central1, so it is used there only.
const region = process.env.FUNCTIONS_EMULATOR ? 'us-central1' : 'asia-southeast1';
const db = () => getDatabase();

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

/** Approves or rejects a new callsign (flag list). Database-triggered, so it needs no public HTTP access. */
export const onPlayerJoined = onValueCreated({ ref: '/games/{game}/players/{uid}/name', region }, async (e) => {
  await approvePlayer(db(), e.params.game, e.params.uid);
});
