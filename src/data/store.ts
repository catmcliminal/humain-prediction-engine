import { initializeApp } from 'firebase/app';
import { initializeAppCheck, ReCaptchaV3Provider } from 'firebase/app-check';
import { connectAuthEmulator, getAuth, signInAnonymously } from 'firebase/auth';
import {
  connectDatabaseEmulator, getDatabase, onValue, push, ref, remove, serverTimestamp, set, update, type Database,
} from 'firebase/database';
import { connectFunctionsEmulator, getFunctions, httpsCallable } from 'firebase/functions';
import { config } from '../config';
import { FREEZE_AT } from '../shared/constants';
import { emptyState, type GameState } from '../shared/types';

type Listener = () => void;
const PATHS = ['players', 'predictions', 'votes', 'ratings', 'downs', 'hidden', 'scrubbed', 'restored'] as const;
type Path = (typeof PATHS)[number];
const KEY: Record<Path, keyof GameState> = {
  players: 'players', predictions: 'preds', votes: 'votes', ratings: 'ratings',
  downs: 'downs', hidden: 'hidden', scrubbed: 'scrubbed', restored: 'restored',
};

export class JoinRejected extends Error {}

/**
 * Firebase adapter. Listens to each game path (Phase 1: no bounded queries) and exposes a plain GameState.
 * RTDB raises local events immediately on write and reverts them if the write is refused, so the
 * UI is optimistic for free: the caller only needs to catch the rejection.
 */
export class Store {
  state: GameState = emptyState();
  me = '';
  /** Every path has delivered its first snapshot. */
  ready = false;
  connected = false;
  everConnected = false;
  fatal: string | null = null;
  offset = 0; // server time minus local time
  private db!: Database;
  private base = `games/${config.gameId}`;
  private subs: Listener[] = [];
  private seen = new Set<Path>();
  private t: ReturnType<typeof setTimeout> | undefined;
  private fns!: ReturnType<typeof getFunctions>;

  on(fn: Listener) { this.subs.push(fn); }
  private emit() {
    clearTimeout(this.t);
    this.t = setTimeout(() => this.subs.forEach((f) => f()), 40);
  }

  /** Server time, so a phone with a wrong clock still freezes at the right moment. */
  now() { return Date.now() + this.offset; }
  frozen() { return this.now() >= FREEZE_AT; }
  /** Actions are disabled while the connection is down. */
  canAct() { return this.ready && this.connected; }

  async init() {
    const cfg = config.firebase;
    if (!cfg.projectId || !cfg.databaseURL) throw new Error('Firebase is not configured (see .env.example)');
    const app = initializeApp(cfg);
    if (config.appCheckDebug) (self as unknown as Record<string, unknown>).FIREBASE_APPCHECK_DEBUG_TOKEN = true;
    if (!config.useEmulator && config.appCheckSiteKey) {
      initializeAppCheck(app, { provider: new ReCaptchaV3Provider(config.appCheckSiteKey), isTokenAutoRefreshEnabled: true });
    }
    const auth = getAuth(app);
    this.db = getDatabase(app);
    this.fns = getFunctions(app, config.functionsRegion);
    if (config.useEmulator) {
      connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
      connectDatabaseEmulator(this.db, '127.0.0.1', 9000);
      connectFunctionsEmulator(this.fns, '127.0.0.1', 5001);
    }
    this.me = (await signInAnonymously(auth)).user.uid;

    onValue(ref(this.db, '.info/connected'), (s) => {
      this.connected = s.val() === true;
      if (this.connected) this.everConnected = true;
      this.emit();
    });
    onValue(ref(this.db, '.info/serverTimeOffset'), (s) => { this.offset = Number(s.val()) || 0; this.emit(); });
    for (const p of PATHS) {
      onValue(
        ref(this.db, `${this.base}/${p}`),
        (s) => {
          (this.state as unknown as Record<string, unknown>)[KEY[p]] = s.val() ?? {};
          this.seen.add(p);
          this.ready = this.seen.size === PATHS.length;
          this.emit();
        },
        (e) => { console.error(e); this.fatal = 'CONNECTION ERROR'; this.emit(); },
      );
    }
  }

  private r(p: string) { return ref(this.db, `${this.base}/${p}`); }

  /** The join Function checks the callsign against the flag list and the freeze, then writes the player. */
  async join(name: string, color: string) {
    try {
      await httpsCallable(this.fns, 'join')({ game: config.gameId, name, color });
    } catch (e) {
      const code = (e as { code?: string }).code ?? '';
      if (code.endsWith('invalid-argument')) throw new JoinRejected((e as Error).message.replace(/\s*\[\d+\]$/, '')); // some runtimes append the HTTP status
      throw e;
    }
  }

  /** One multi-path update: the prediction, the rate-limit stamp and the +1 counter (the rules check all three). */
  submit(text: string, tag: number) {
    const id = push(this.r('predictions')).key as string;
    const count = (this.state.players[this.me]?.count ?? 0) + 1;
    return update(ref(this.db, this.base), {
      [`predictions/${id}`]: { pid: this.me, text, tag, ts: serverTimestamp() },
      [`players/${this.me}/lastPost`]: serverTimestamp(),
      [`players/${this.me}/count`]: count,
    });
  }
  vote(id: string, on: boolean) { return on ? set(this.r(`votes/${id}/${this.me}`), true) : remove(this.r(`votes/${id}/${this.me}`)); }
  down(id: string, on: boolean) { return on ? set(this.r(`downs/${id}/${this.me}`), true) : remove(this.r(`downs/${id}/${this.me}`)); }
  rate(id: string, n: number) { return set(this.r(`ratings/${id}/${this.me}`), n); }
}
