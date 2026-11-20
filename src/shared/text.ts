import { CALLSIGN_MAX, CALLSIGN_MIN, PREDICTION_MAX, PREDICTION_MIN } from './constants';

/**
 * Must stay identical to the URL regex in database.rules.template.json (a parity test checks a shared table).
 * Matches schemes, www., and a short list of common TLDs directly after a letter or digit.
 */
export const URL_RE = /(https?:|www\.|:\/\/|[a-z0-9]\.(com|net|org|au|io|ai|co|app|dev|xyz|me|ly|gg|tv|to|uk|nz|us|info|biz)(?![a-z0-9]))/;
export const hasUrl = (text: string) => URL_RE.test(text.toLowerCase());

/** Whitespace collapsed, trimmed, capped at the maximum. */
export const cleanPrediction = (s: string) => s.trim().replace(/\s+/g, ' ').slice(0, PREDICTION_MAX);

export const predictionError = (s: string): string | null => {
  const t = cleanPrediction(s);
  if (t.length < PREDICTION_MIN) return 'TOO SHORT';
  if (hasUrl(t)) return 'NO LINKS';
  return null;
};

/** Callsigns: uppercase, A-Z 0-9 _ . - and space only, 2..12 chars. */
export const cleanCallsign = (s: string) => s.toUpperCase().replace(/[^A-Z0-9_.\- ]/g, '').trim().slice(0, CALLSIGN_MAX);
export const callsignOk = (s: string) => s.length >= CALLSIGN_MIN && s.length <= CALLSIGN_MAX;
