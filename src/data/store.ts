import { initializeApp } from 'firebase/app';
import { initializeAppCheck, ReCaptchaV3Provider } from 'firebase/app-check';
import { connectAuthEmulator, getAuth, signInAnonymously, signOut } from 'firebase/auth';
import {
  connectDatabaseEmulator, get, getDatabase, onValue, push, ref, remove, serverTimestamp, set, update, type Database,
} from 'firebase/database';
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
  /** Host-only data: flags written by the Function. Empty for everyone else. */
  flags: Record<string, { ts?: number }> = {};
  isHost = false;
  private db!: Database;
  private base = `games/${config.gameId}`;
  private subs: Listener[] = [];
  private seen = new Set<string>();
  /** Server verdict on this player's callsign (written by the onPlayerJoined Function). */
  joinVerdict: { ok?: boolean; rejected?: string; ts?: number } | null = null;
  private t: ReturnType<typeof setTimeout> | undefined;

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
    if (config.useEmulator) {
      connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
      connectDatabaseEmulator(this.db, '127.0.0.1', 9000);
    }
    // A remembered anonymous user can be gone server-side (cleared by an admin, or a reset emulator). If its token
    // cannot be refreshed, start over as a new player rather than hanging on "CONNECTING".
    await auth.authStateReady();
    if (auth.currentUser) {
      try { await auth.currentUser.getIdToken(true); } catch { await signOut(auth); }
    }
    this.me = (await signInAnonymously(auth)).user.uid;

    onValue(ref(this.db, '.info/connected'), (s) => {
      this.connected = s.val() === true;
      if (this.connected) this.everConnected = true;
      this.emit();
    });
    onValue(ref(this.db, '.info/serverTimeOffset'), (s) => { this.offset = Number(s.val()) || 0; this.emit(); });
    onValue(ref(this.db, `${this.base}/joins/${this.me}`), (s) => {
      this.joinVerdict = s.val();
      this.seen.add('joins');
      this.ready = this.seen.size === PATHS.length + 1;
      this.emit();
    }, (e) => { console.error(e); this.fatal = 'CONNECTION ERROR'; this.emit(); });
    for (const p of PATHS) {
      onValue(
        ref(this.db, `${this.base}/${p}`),
        (s) => {
          (this.state as unknown as Record<string, unknown>)[KEY[p]] = s.val() ?? {};
          this.seen.add(p);
          this.ready = this.seen.size === PATHS.length + 1;
          this.emit();
        },
        (e) => { console.error(e); this.fatal = 'CONNECTION ERROR'; this.emit(); },
      );
    }
  }

  /** Starts the host-only feed (flags). There is no PIN: any signed-in visitor of #host can moderate. */
  async detectHost(): Promise<boolean> {
    try {
      const snap = await get(this.r('flags'));
      this.flags = snap.val() ?? {};
      if (!this.isHost) {
        this.isHost = true;
        onValue(this.r('flags'), (s) => { this.flags = s.val() ?? {}; this.emit(); });
      }
      this.emit();
      return true;
    } catch {
      this.isHost = false;
      return false;
    }
  }
  /** HIDE: hidden on, restore marker off. */
  hide(id: string) { return update(ref(this.db, this.base), { [`hidden/${id}`]: true, [`restored/${id}`]: null }); }
  /** RESTORE: hidden off, restore marker on (the marker stops phones pre-hiding flagged text). */
  restore(id: string) { return update(ref(this.db, this.base), { [`hidden/${id}`]: null, [`restored/${id}`]: true }); }

  private r(p: string) { return ref(this.db, `${this.base}/${p}`); }

  /**
   * Join: the phone writes its own callsign, colour and join time (the rules check their shape and that they are
   * set only once). The onPlayerJoined Function then checks the callsign against the flag list and writes the
   * verdict to joins/{me}. A flagged callsign is removed again and the player may try another.
   */
  async join(name: string, color: string) {
    const before = this.joinVerdict?.ts;
    await update(this.r(`players/${this.me}`), { name, color, ts: serverTimestamp() });
    const end = Date.now() + 20_000;
    while (Date.now() < end) {
      const v = this.joinVerdict;
      if (v && v.ts !== before) {
        if (v.ok) return;
        throw new JoinRejected(v.rejected ?? 'CALLSIGN NOT ALLOWED. TRY ANOTHER.');
      }
      await new Promise((r) => setTimeout(r, 150));
    }
    throw new Error('join timed out');
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
