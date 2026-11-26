import type { FlagList } from './types';

/** Lazily loaded flag matcher: pre-hides flagged text on screens until the host decides. */
export async function loadFlagger() {
  const { makeFlagger } = await import('./flagger');
  return makeFlagger((await import('./flagwords.json')).default as FlagList);
}
