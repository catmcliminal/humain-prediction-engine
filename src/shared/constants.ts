/** Every game threshold lives here. Shared by the browser, the Cloud Functions and the tests. */

/** Midnight New Year's Eve, Sydney (1 Jan 2027 00:00 AEDT). Also injected into database.rules.json. */
export const FREEZE_AT = 1798722000000;

/** Live quiz answer window. The rules allow ANSWER_GRACE_MS on top for slow phones. */
export const ANSWER_WINDOW_MS = 20_000;
export const ANSWER_GRACE_MS = 2_000;
export const CORRECT_POINTS = 100;
export const SPEED_BONUS_MAX = 50;

/* content and rate limits (enforced in database rules, mirrored in the client) */
export const CALLSIGN_MIN = 2;
export const CALLSIGN_MAX = 20;
export const PREDICTION_MIN = 8;
export const PREDICTION_MAX = 140;
export const POST_INTERVAL_MS = 15_000;

/* how wild a prediction is: players rate 1 to 5 */
export const LEVELS = ['PLAUSIBLE', 'PROBABLE-ISH', 'BOLD', 'SPICY', 'UNHINGED'] as const;
export const RATINGS = [1, 2, 3, 4, 5] as const;
/** Ratings needed before a prediction can ride the mothership, or make the final board. */
export const LEADER_MIN_RATINGS = 2;
export const FINAL_MIN_RATINGS = 3;

export const FEED_PAGE = 40;
export const SEED_AUTHOR = 'seed';

export const CALLSIGN_REJECTED = 'NICKNAME NOT ALLOWED. TRY ANOTHER.';
export const CALLSIGN_TAKEN = 'NICKNAME TAKEN. TRY ANOTHER.';
