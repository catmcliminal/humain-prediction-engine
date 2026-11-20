export interface Player {
  name: string;
  color: string;
  ts?: number;
  lastPost?: number;
  count?: number;
}
export interface Prediction {
  pid: string;
  text: string;
  tag: number;
  ts: number;
}
type PerPred<T> = Record<string, Record<string, T>>;

/** The prototype's data model under games/{gameId}/ */
export interface GameState {
  players: Record<string, Player>;
  preds: Record<string, Prediction>;
  votes: PerPred<boolean>;
  ratings: PerPred<number>;
  downs: PerPred<boolean>;
  hidden: Record<string, boolean>;
  scrubbed: Record<string, boolean>;
  /** Host RESTORE marker: overrides the client-side pre-hide for a flagged prediction. */
  restored: Record<string, boolean>;
}

export const emptyState = (): GameState => ({
  players: {}, preds: {}, votes: {}, ratings: {}, downs: {}, hidden: {}, scrubbed: {}, restored: {},
});

export interface DerivedPrediction extends Prediction {
  id: string;
  votes: number;
  downs: number;
  nr: number; // number of ratings
  crowd: number | null;
  useCrowd: boolean;
  lvl: number; // the multiplier: crowd average once 3+ ratings, else the tag
  row: number; // 1..6
  points: number;
  reclass: boolean;
  lvup: boolean;
  shot: boolean; // 3+ shoot-downs and more than upvotes
}

export interface FlagList {
  matching: { leet: Record<string, string> };
  words: string[];
  phrases: string[];
  compact: string[];
  symbols: string[];
  allowlist: string[];
}
