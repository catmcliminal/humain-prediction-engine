import { initializeApp } from 'firebase/app';
import { initializeAppCheck, ReCaptchaV3Provider } from 'firebase/app-check';
import { connectAuthEmulator, getAuth, signInAnonymously, signOut } from 'firebase/auth';
import {
  connectDatabaseEmulator, forceWebSockets, get, getDatabase, onValue, push, ref, remove, serverTimestamp, set, update, type Database,
} from 'firebase/database';
import { config } from '../config';
import { FREEZE_AT, SEED_AUTHOR } from '../shared/constants';
import { deckCards, stateAt } from '../shared/game';
import { emptyState, type Answer, type GameState, type StateName, type Vote } from '../shared/types';

type Listener = () => void;
const PATHS = ['players', 'predictions', 'votes', 'tags', 'hidden', 'restored', 'cards', 'show', 'revealed', 'opened', 'answered'] as const;
type Path = (typeof PATHS)[number];
const KEY: Record<Path, keyof GameState> = {
  players: 'players', predictions: 'preds', votes: 'votes', tags: 'tags', hidden: 'hidden', restored: 'restored',
  cards: 'cards', show: 'show', revealed: 'revealed', opened: 'opened', answered: 'answered',
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
    // WebSockets only. The long-polling fallback loads scripts from the database host, which humain.au's content
    // security policy blocks, and the SDK remembers one failed socket and would then stay on that dead fallback.
    forceWebSockets();
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
          this.sync();
          this.emit();
        },
        (e) => { console.error(e); this.fatal = 'CONNECTION ERROR'; this.emit(); },
      );
    }
  }

  /**
   * Answers and answer keys are only readable once the rules allow it (after a reveal, or your own answer to an
   * arrival card), so each is subscribed when it becomes available and dropped again if the quiz is reset.
   */
  private watching = new Map<string, () => void>();
  private watch(path: string, want: boolean, put: (v: unknown) => void) {
    const stop = this.watching.get(path);
    if (!want) {
      if (stop) { stop(); this.watching.delete(path); put(null); }
      return;
    }
    if (stop) return;
    // Cached data calls back synchronously, so the entry is recorded first and the re-sync is deferred.
    this.watching.set(path, () => {});
    let live = true;
    const off = onValue(this.r(path), (s) => { put(s.val()); this.emit(); this.later(); },
      () => { live = false; this.watching.delete(path); put(null); this.emit(); });
    if (live) this.watching.set(path, off);
  }
  private pending = false;
  private later() {
    if (this.pending) return;
    this.pending = true;
    queueMicrotask(() => { this.pending = false; this.sync(); });
  }
  private sync() {
    const s = this.state;
    for (const [id, card] of Object.entries(s.cards)) {
      const open = !!s.revealed[id] || this.isHost;
      const answered = !!s.answered[id]?.[this.me];
      this.watch(`answers/${id}`, open, (v) => {
        if (v) s.answers[id] = v as GameState['answers'][string];
        else if (!answered) delete s.answers[id];
      });
      this.watch(`answers/${id}/${this.me}`, !open && answered, (v) => {
        if (v) s.answers[id] = { [this.me]: v as { a: Answer; ts: number } };
        else if (!s.revealed[id] && !s.answered[id]?.[this.me]) delete s.answers[id];
      });
      this.watch(`key/${id}`, open || (answered && card.deck === 'arrival'), (v) => {
        if (v) s.keys[id] = v as GameState['keys'][string]; else delete s.keys[id];
      });
    }
  }

  /** Host unlock: the rules accept hosts/{me} only when the word matches secrets/hostWord. */
  async unlockHost(word?: string): Promise<boolean> {
    try {
      if (word !== undefined) await set(this.r(`hosts/${this.me}`), word.trim().toLowerCase());
      else if (!(await get(this.r(`hosts/${this.me}`))).exists()) return false;
    } catch { return false; }
    if (!this.isHost) {
      // Drop the player-level listeners so they are re-attached with host access.
      this.watching.forEach((off) => off());
      this.watching.clear();
      this.isHost = true;
      onValue(this.r('flags'), (s) => { this.flags = s.val() ?? {}; this.emit(); });
      this.sync();
    }
    this.emit();
    return true;
  }

  /* ---------- host actions ---------- */
  /** HIDE: hidden on, restore marker off. */
  hide(id: string) { return update(ref(this.db, this.base), { [`hidden/${id}`]: true, [`restored/${id}`]: null }); }
  /** RESTORE: hidden off, restore marker on (the marker stops phones pre-hiding flagged text). */
  restore(id: string) { return update(ref(this.db, this.base), { [`hidden/${id}`]: null, [`restored/${id}`]: true }); }

  /** Moving past arrival reveals the arrival cards (so their scores count). Opening predictions loads the seeds. */
  async setState(name: StateName) {
    const up: Record<string, unknown> = { 'show/name': name, 'show/card': null };
    if (name !== 'ARRIVAL' && name !== 'PAUSED') for (const c of deckCards(this.state, 'arrival')) if (!this.state.revealed[c.id]) up[`revealed/${c.id}`] = true;
    await update(ref(this.db, this.base), up);
    if (name === 'PREDICT') await this.loadSeeds();
  }
  private async loadSeeds() {
    const keys = ((await get(this.r('key'))).val() ?? {}) as GameState['keys'];
    for (const k of Object.values(keys)) {
      if (!k.seed || !k.seedText || this.state.preds[k.seed]) continue;
      await set(this.r(`predictions/${k.seed}`), { pid: SEED_AUTHOR, seed: true, text: k.seedText, ts: serverTimestamp() });
    }
  }
  /** Puts a card on every screen and starts its clock (an already revealed card just shows its reveal). */
  showCard(id: string) {
    const up: Record<string, unknown> = { 'show/name': 'LIVE_QUIZ', 'show/card': id };
    if (!this.state.revealed[id]) up[`opened/${id}`] = serverTimestamp();
    return update(ref(this.db, this.base), up);
  }
  reveal(id: string) { return set(this.r(`revealed/${id}`), true); }
  /** False start: wipes every host-led answer, reveal and clock. Arrival answers are untouched. */
  resetQuiz() {
    const up: Record<string, unknown> = { 'show/name': 'LIVE_QUIZ', 'show/card': null };
    for (const [id, c] of Object.entries(this.state.cards)) {
      if (c.deck === 'arrival') continue;
      for (const n of ['answers', 'answered', 'revealed', 'opened']) up[`${n}/${id}`] = null;
    }
    return update(ref(this.db, this.base), up);
  }

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
        throw new JoinRejected(v.rejected ?? 'NICKNAME NOT ALLOWED. TRY ANOTHER.');
      }
      await new Promise((r) => setTimeout(r, 150));
    }
    throw new Error('join timed out');
  }

  /** One multi-path update: the prediction and the cooldown stamp (the rules check both). */
  submit(text: string) {
    const id = push(this.r('predictions')).key as string;
    return update(ref(this.db, this.base), {
      [`predictions/${id}`]: { pid: this.me, text, ts: serverTimestamp() },
      [`players/${this.me}/lastPost`]: serverTimestamp(),
    });
  }
  answer(card: string, a: Answer) {
    return update(ref(this.db, this.base), { [`answers/${card}/${this.me}`]: { a, ts: serverTimestamp() }, [`answered/${card}/${this.me}`]: true });
  }
  vote(id: string, v: Vote) { return set(this.r(`votes/${id}/${this.me}`), v); }
  tag(id: string, on: boolean) { return on ? set(this.r(`tags/${id}/${this.me}`), true) : remove(this.r(`tags/${id}/${this.me}`)); }
  show() { return stateAt(this.state, this.now()); }
}
