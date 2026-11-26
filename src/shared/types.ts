export const STATES = ['ARRIVAL', 'PAUSED', 'LIVE_QUIZ', 'QUIZ_RESULTS', 'PREDICT', 'FROZEN'] as const;
export type StateName = (typeof STATES)[number];
export type Answer = 'real' | 'fake';
/** How wild a player rates a prediction: 1 CERTAIN to 5 UNHINGED. */
export type Vote = 1 | 2 | 3 | 4 | 5;

export interface Player { name: string; color: string; ts?: number; lastPost?: number }
export interface Prediction { pid: string; text: string; ts: number; seed?: boolean }
export interface Card { text: string; deck: 'arrival' | 'live' | 'reserve'; order: number }
export interface CardKey { real: boolean; explainer: string; source?: string; seed?: string; seedText?: string }
export interface Show { name?: StateName; card?: string | null }
type Nested<T> = Record<string, Record<string, T>>;

/** The data under games/{gameId}/ as a client sees it. Answers and keys hold only what the rules let it read. */
export interface GameState {
  players: Record<string, Player>;
  preds: Record<string, Prediction>;
  votes: Nested<Vote>;
  tags: Nested<boolean>;
  hidden: Record<string, boolean>;
  restored: Record<string, boolean>;
  cards: Record<string, Card>;
  show: Show;
  revealed: Record<string, boolean>;
  opened: Record<string, number>;
  answered: Nested<boolean>;
  keys: Record<string, CardKey>;
  answers: Nested<{ a: Answer; ts: number }>;
}

export const emptyState = (): GameState => ({
  players: {}, preds: {}, votes: {}, tags: {}, hidden: {}, restored: {}, cards: {}, show: {},
  revealed: {}, opened: {}, answered: {}, keys: {}, answers: {},
});

export interface FlagList {
  matching: { leet: Record<string, string> };
  words: string[];
  phrases: string[];
  compact: string[];
  symbols: string[];
  allowlist: string[];
}
