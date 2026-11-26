import { initializeApp } from 'firebase-admin/app';
import { getDatabase } from 'firebase-admin/database';
import { onValueCreated } from 'firebase-functions/v2/database';
import { approvePlayer, flagPrediction } from './core';

// In the cloud the database lives in Singapore, so name it explicitly (the default guess targets us-central1).
// The emulator keeps the default.
initializeApp(process.env.FUNCTIONS_EMULATOR ? undefined : { databaseURL: 'https://predictionengine-46f43-default-rtdb.asia-southeast1.firebasedatabase.app' });
// Realtime Database has no Sydney region; Singapore is the closest. Database-triggered Functions must sit in the
// database's region. The emulator assumes us-central1, so it is used there only.
const region = process.env.FUNCTIONS_EMULATOR ? 'us-central1' : 'asia-southeast1';
const db = () => getDatabase();

export const onPredictionCreated = onValueCreated({ ref: '/games/{game}/predictions/{id}', region }, async (e) => {
  const p = e.data.val();
  if (!p?.seed) await flagPrediction(db(), e.params.game, e.params.id, p?.text);
});

/**
 * Approves or rejects a new nickname. Database-triggered, so it needs no public HTTP access.
 * One instance stays warm so joining is quick on the night. Set minInstances to 0 after the event to stop the idle cost.
 */
export const onPlayerJoined = onValueCreated({ ref: '/games/{game}/players/{uid}/name', region, minInstances: process.env.FUNCTIONS_EMULATOR ? 0 : 1 }, async (e) => {
  await approvePlayer(db(), e.params.game, e.params.uid);
});
