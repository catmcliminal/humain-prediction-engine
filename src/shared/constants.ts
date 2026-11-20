/**
 * Every game threshold lives here as a named constant. Shared by the browser,
 * the Cloud Functions and the tests, so the three can never disagree.
 * Source of truth for the values: HANDOFF.md.
 */

/** Midnight New Year's Eve, Sydney (1 Jan 2027 00:00 AEDT). Also hard-coded in database.rules.json. */
export const FREEZE_AT = 1798722000000;

/* ---- levels ---- */
export const LEVEL_MIN = 1;
export const LEVEL_MAX_TAG = 5; // players can tag 1..5
export const LEVEL_CYBER = 6; // crowd-only
export const RATING_MAX = 6; // ratings run 1..6

export const LEVELS: Record<number, { name: string; token: string }> = {
  1: { name: 'PLAUSIBLE', token: 'level1' },
  2: { name: 'PROBABLE-ISH', token: 'level2' },
  3: { name: 'BOLD', token: 'level3' },
  4: { name: 'SPICY', token: 'level4' },
  5: { name: 'UNHINGED', token: 'level5' },
  6: { name: 'CYBERBONKERS', token: 'cyber' },
};

/* ---- scoring and crowd rules ---- */
export const POINTS_PER_VOTE = 100; // score = votes x 100 x level
export const CROWD_RATINGS_TO_OVERRULE = 3; // crowd average replaces the author's tag
export const CYBER_MIN = 3; // ratings of 6 needed...
export const CYBER_AVG_MIN = 5.5; // ...and a crowd average at least this

/* ---- arcade events ---- */
export const LEVEL_UP_VOTES = 2;
export const SHOOT_DOWN_MIN = 3; // shoot-downs needed, and they must exceed upvotes
export const RAID = { every: 180_000, minAge: 300_000 } as const; // ms: a raid every 3 min on 0-vote cards older than 5 min
export const FLEET_MAX = 8; // cards shown per row on the big screen

/* ---- content and rate limits (enforced in database rules, mirrored in the client) ---- */
export const CALLSIGN_MIN = 2;
export const CALLSIGN_MAX = 12;
export const PREDICTION_MIN = 8;
export const PREDICTION_MAX = 140;
export const POST_INTERVAL_MS = 15_000;
export const MAX_PREDICTIONS_PER_PLAYER = 10;

/* ---- UI paging ---- */
export const FEED_PAGE = 40;
export const FORMATIONS_MIN_RECOMPUTE_MS = 5_000;

export const CALLSIGN_REJECTED = 'CALLSIGN NOT ALLOWED. TRY ANOTHER.';
