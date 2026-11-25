/**
 * Headless load test: simulated phones plus one "big screen" observer.
 *
 * Each player behaves like the real phone: signs in, calls the `join` Function, listens to the same eight
 * game paths, then fires (max 10, one per 15 s), upvotes, rates and shoots down at random.
 * One observer client listens like the projector does and measures how long a vote or a new prediction
 * takes to arrive after the writer started the write.
 *
 *   npm run loadtest -- --target=emulator --players=100 --minutes=2 --smoke   (local smoke test)
 *   npm run loadtest -- --target=staging  --players=300 --minutes=20       (the real pass/fail run)
 *
 * Staging: put the variables below in .env.staging (git-ignored) and run with  npx tsx --env-file=.env.staging scripts/loadtest/run.ts --target=staging
 * Staging needs (see RUNBOOK / M6): the staging project's web config in env vars (same names as
 * .env.example), GOOGLE_APPLICATION_CREDENTIALS pointing at a staging service-account key (to mint
 * sign-in tokens, because Firebase throttles anonymous sign-ups per IP), and APPCHECK_DEBUG_TOKEN
 * (a debug token registered in the staging App Check console).
 */
import { initializeApp, type FirebaseApp } from 'firebase/app';
import { CustomProvider, initializeAppCheck } from 'firebase/app-check';
import { connectAuthEmulator, getAuth, signInAnonymously, signInWithCustomToken } from 'firebase/auth';
import { connectDatabaseEmulator, get, getDatabase, onChildAdded, onValue, push, ref, remove, serverTimestamp, set, update, type Database } from 'firebase/database';
import { MAX_PREDICTIONS_PER_PLAYER, POST_INTERVAL_MS } from '../../src/shared/constants';
import { makeFlagger } from '../../src/shared/flagger';
import flagList from '../../src/shared/flagwords.json';
import type { FlagList } from '../../src/shared/types';
import { CRITERIA, evaluate, makePrediction, pick, rng, summarize, type Report } from './lib';

const arg = (k: string, d: string) => process.argv.find((a) => a.startsWith(`--${k}=`))?.split('=')[1] ?? d;
const flag = (k: string) => process.argv.includes(`--${k}`);
const TARGET = arg('target', 'emulator') as 'emulator' | 'staging';
const PLAYERS = Number(arg('players', String(CRITERIA.players)));
const MINUTES = Number(arg('minutes', String(CRITERIA.minutes)));
const RAMP_S = Number(arg('ramp', String(Math.min(60, MINUTES * 15))));
const SEED = Number(arg('seed', '1'));
const GAME = arg('game', `loadtest-${new Date().toISOString().replace(/\D/g, '').slice(0, 12)}`);
/** Mean seconds between a player's actions. Real players are slower than this, so it is a stress setting. */
/** Emulator only: the Functions emulator cannot take many simultaneous joins, so write the player record with the Admin SDK instead. */
const DIRECT_JOIN = flag('direct-join') && TARGET === 'emulator';
const THINK_S = Number(arg('think', '5'));

const env = process.env;
const emulator = TARGET === 'emulator';
const cfg = emulator
  ? { apiKey: 'demo', authDomain: 'localhost', projectId: 'demo-pe27', databaseURL: 'http://127.0.0.1:9000?ns=demo-pe27', appId: 'demo' }
  : {
      apiKey: env.VITE_FIREBASE_API_KEY, authDomain: env.VITE_FIREBASE_AUTH_DOMAIN, projectId: env.VITE_FIREBASE_PROJECT_ID,
      databaseURL: env.VITE_FIREBASE_DATABASE_URL, appId: env.VITE_FIREBASE_APP_ID,
    };
const PATHS = ['players', 'predictions', 'votes', 'ratings', 'downs', 'hidden', 'scrubbed', 'restored'] as const;
const isFlagged = makeFlagger(flagList as FlagList);

/* ---------- metrics ---------- */
const lat = { join: [] as number[], fireAck: [] as number[], voteAck: [] as number[], rateAck: [] as number[], downAck: [] as number[], voteToScreen: [] as number[], fireToScreen: [] as number[] };
const counts = { fire: 0, vote: 0, rate: 0, down: 0 };
const errors = new Map<string, number>();
let errorTotal = 0;
const fail = (where: string, e: unknown) => {
  errorTotal++;
  const m = `${where}: ${(e as Error)?.message ?? e}`.slice(0, 160);
  errors.set(m, (errors.get(m) ?? 0) + 1);
};
const pending = new Map<string, number>(); // "votes/<pred>/<uid>" or "predictions/<id>" -> t0 (ms)
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/* ---------- Firebase plumbing ---------- */
let debugToken: { token: string; exp: number } | null = null;
async function appCheckToken() {
  if (debugToken && debugToken.exp - Date.now() > 300_000) return debugToken;
  const r = await fetch(`https://firebaseappcheck.googleapis.com/v1/projects/${cfg.projectId}/apps/${cfg.appId}:exchangeDebugToken?key=${cfg.apiKey}`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ debug_token: env.APPCHECK_DEBUG_TOKEN }),
  });
  if (!r.ok) throw new Error(`App Check debug token exchange failed (${r.status}): ${await r.text()}`);
  const j = (await r.json()) as { token: string; ttl: string };
  debugToken = { token: j.token, exp: Date.now() + parseInt(j.ttl, 10) * 1000 };
  return debugToken;
}

let minter: ((uid: string) => Promise<string>) | null = null;
async function initMinter() {
  if (emulator) return;
  const { initializeApp: initAdmin, applicationDefault } = await import('firebase-admin/app');
  const { getAuth: adminAuth } = await import('firebase-admin/auth');
  const a = adminAuth(initAdmin({ credential: applicationDefault(), projectId: cfg.projectId }, 'loadtest-admin'));
  minter = (uid) => a.createCustomToken(uid);
}

interface Client { app: FirebaseApp; db: Database; uid: string; join: (name: string, color: string) => Promise<unknown> }
async function connect(name: string, uidHint: string): Promise<Client> {
  const app = initializeApp(cfg, name);
  if (!emulator) {
    if (!env.APPCHECK_DEBUG_TOKEN) throw new Error('APPCHECK_DEBUG_TOKEN is required for --target=staging');
    initializeAppCheck(app, { provider: new CustomProvider({ getToken: async () => { const t = await appCheckToken(); return { token: t.token, expireTimeMillis: t.exp }; } }), isTokenAutoRefreshEnabled: false });
  }
  const auth = getAuth(app);
  const db = getDatabase(app);
  if (emulator) {
    connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
    connectDatabaseEmulator(db, '127.0.0.1', 9000);
  }
  const cred = emulator ? await signInAnonymously(auth) : await signInWithCustomToken(auth, await minter!(uidHint));
  const uid = cred.user.uid;
  // Same flow as a phone: write the callsign, then wait for the onPlayerJoined Function's verdict.
  const join = async (n: string, c: string) => {
    await update(ref(db, `games/${GAME}/players/${uid}`), { name: n, color: c, ts: serverTimestamp() });
    const t0 = Date.now();
    while (Date.now() - t0 < 20_000) {
      const v = (await get(ref(db, `games/${GAME}/joins/${uid}`))).val();
      if (v?.ok) return;
      if (v?.rejected) throw new Error(v.rejected);
      await sleep(200);
    }
    throw new Error('join timed out');
  };
  if (DIRECT_JOIN) {
    // Emulator only: skip the Functions emulator (slow under many joins) and approve the player with the Admin SDK.
    const { initializeApp: initAdmin, getApps } = await import('firebase-admin/app');
    const { getDatabase: adminDb } = await import('firebase-admin/database');
    process.env.FIREBASE_DATABASE_EMULATOR_HOST = '127.0.0.1:9000';
    const aa = getApps().find((x) => x.name === 'lt-direct') ?? initAdmin({ projectId: cfg.projectId, databaseURL: cfg.databaseURL }, 'lt-direct');
    return { app, db, uid, join: async (n, c) => { await adminDb(aa).ref(`games/${GAME}`).update({ [`players/${uid}`]: { name: n, color: c, ts: Date.now() }, [`joins/${uid}`]: { ok: true, ts: Date.now() } }); } };
  }
  return { app, db, uid, join };
}
const R = (db: Database, p: string) => ref(db, `games/${GAME}/${p}`);

/* ---------- the observer: what the projector sees ---------- */
async function startObserver() {
  const c = await connect('observer', 'lt-observer');
  onValue(R(c.db, 'votes'), (snap) => {
    const t = performance.now();
    for (const [key, t0] of pending) {
      if (key.startsWith('votes/') && snap.child(key.slice(6)).exists()) { lat.voteToScreen.push(t - t0); pending.delete(key); }
    }
  });
  onChildAdded(R(c.db, 'predictions'), (snap) => {
    const key = `predictions/${snap.key}`, t0 = pending.get(key);
    if (t0 !== undefined) { lat.fireToScreen.push(performance.now() - t0); pending.delete(key); }
  });
  return c;
}

/* ---------- one simulated phone ---------- */
const COLORS = ['#39ff14', '#00e5ff', '#ffe600', '#ff8a00', '#ff2bd6', '#b388ff'];
let joined = 0;
async function player(i: number, endAt: number) {
  const r = rng(SEED * 100_000 + i);
  const c = await connect(`p${i}`, `lt-${GAME}-${i}`);
  // listen like a phone does (Phase 1: whole paths)
  const preds: Record<string, { pid: string }> = {};
  for (const p of PATHS) onValue(R(c.db, p), (s) => { if (p === 'predictions') Object.assign(preds, s.val() ?? {}); });

  const t0 = performance.now();
  try {
    await c.join(`LT${String(i).padStart(4, '0')}`, pick(r, COLORS));
    lat.join.push(performance.now() - t0);
    joined++;
  } catch (e) { fail('join', e); return; }

  let fired = 0, lastFire = 0;
  const voted = new Set<string>(), rated = new Set<string>(), downed = new Set<string>();
  while (Date.now() < endAt) {
    await sleep(THINK_S * 1000 * (0.4 + r() * 1.2));
    if (Date.now() >= endAt) break;
    const others = Object.keys(preds).filter((id) => preds[id].pid !== c.uid);
    const roll = r();
    try {
      if ((roll < 0.12 || !others.length) && fired < MAX_PREDICTIONS_PER_PLAYER && Date.now() - lastFire > POST_INTERVAL_MS + 500) {
        let text = makePrediction(r);
        while (isFlagged(text)) text = makePrediction(r);
        const id = push(R(c.db, 'predictions')).key as string;
        pending.set(`predictions/${id}`, performance.now());
        const t = performance.now();
        await update(ref(c.db, `games/${GAME}`), {
          [`predictions/${id}`]: { pid: c.uid, text, tag: 1 + Math.floor(r() * 5), ts: serverTimestamp() },
          [`players/${c.uid}/lastPost`]: serverTimestamp(),
          [`players/${c.uid}/count`]: fired + 1,
        });
        lat.fireAck.push(performance.now() - t);
        fired++; lastFire = Date.now(); counts.fire++;
      } else if (others.length && roll < 0.7) {
        const id = pick(r, others.filter((x) => !voted.has(x)).length ? others.filter((x) => !voted.has(x)) : others);
        if (voted.has(id)) continue;
        voted.add(id);
        const key = `votes/${id}/${c.uid}`;
        pending.set(key, performance.now());
        const t = performance.now();
        await set(R(c.db, `votes/${id}/${c.uid}`), true);
        lat.voteAck.push(performance.now() - t); counts.vote++;
      } else if (others.length && roll < 0.92) {
        const id = pick(r, others);
        const t = performance.now();
        await set(R(c.db, `ratings/${id}/${c.uid}`), 1 + Math.floor(r() * 6));
        rated.add(id); lat.rateAck.push(performance.now() - t); counts.rate++;
      } else if (others.length) {
        const id = pick(r, others);
        if (downed.has(id)) { downed.delete(id); await remove(R(c.db, `downs/${id}/${c.uid}`)); continue; }
        downed.add(id);
        const t = performance.now();
        await set(R(c.db, `downs/${id}/${c.uid}`), true);
        lat.downAck.push(performance.now() - t); counts.down++;
      }
    } catch (e) { fail(`player ${i}`, e); }
  }
}

/* ---------- main ---------- */
async function main() {
  if (!emulator && !(cfg.projectId && cfg.databaseURL && cfg.apiKey && cfg.appId)) throw new Error('Staging web config missing (VITE_FIREBASE_* env vars).');
  if (!emulator && /prod|humain-prediction-engine$/.test(cfg.projectId ?? '') && !flag('i-know-this-is-not-prod')) {
    console.warn(`Project id "${cfg.projectId}" ... make sure this is STAGING. Pass --i-know-this-is-not-prod to silence this check.`);
  }
  await initMinter();
  console.log(`load test: target=${TARGET} game=${GAME} players=${PLAYERS} minutes=${MINUTES} ramp=${RAMP_S}s think=${THINK_S}s`);
  const observer = await startObserver();
  void observer;
  const startedAt = Date.now(), endAt = startedAt + MINUTES * 60_000;
  const tasks: Promise<void>[] = [];
  for (let i = 0; i < PLAYERS; i++) {
    tasks.push(sleep((i / PLAYERS) * RAMP_S * 1000).then(() => player(i, endAt)).catch((e) => fail(`player ${i} setup`, e)));
  }
  const tick = setInterval(() => {
    const s = (x: number[]) => (x.length ? Math.round(summarize(x).p95) : '-');
    console.log(`[${Math.round((Date.now() - startedAt) / 1000)}s] joined=${joined}/${PLAYERS} votes=${counts.vote} fires=${counts.fire} rates=${counts.rate} downs=${counts.down} errors=${errorTotal} vote->screen p95=${s(lat.voteToScreen)}ms`);
  }, 30_000);
  await Promise.all(tasks);
  await sleep(5000); // let the observer drain
  clearInterval(tick);

  const lost = [...pending.values()].filter((t0) => performance.now() - t0 > 5000).length;
  const report: Report = {
    players: PLAYERS, minutes: MINUTES, joined, errors: errorTotal, lost,
    voteToScreen: summarize(lat.voteToScreen), fireToScreen: summarize(lat.fireToScreen),
  };
  const smoke = flag('smoke');
  const verdict = evaluate(report, smoke ? { ...CRITERIA, players: PLAYERS, minutes: MINUTES } : CRITERIA);
  const f = (s: ReturnType<typeof summarize>) => (s.n ? `n=${s.n} p50=${Math.round(s.p50)} p95=${Math.round(s.p95)} p99=${Math.round(s.p99)} max=${Math.round(s.max)} ms` : 'no samples');
  console.log('\n===== RESULT =====');
  console.log(`players joined      ${joined}/${PLAYERS}`);
  console.log(`actions             ${JSON.stringify(counts)}`);
  console.log(`join (approval)     ${f(summarize(lat.join))}`);
  console.log(`vote -> screen      ${f(report.voteToScreen)}   (criterion: p95 < ${CRITERIA.voteToScreenP95Ms} ms)`);
  console.log(`fire -> screen      ${f(report.fireToScreen)}`);
  console.log(`write ack (fire)    ${f(summarize(lat.fireAck))}`);
  console.log(`write ack (vote)    ${f(summarize(lat.voteAck))}`);
  console.log(`errors              ${errorTotal}   writes never seen on screen: ${lost}`);
  for (const [m, n] of [...errors].slice(0, 10)) console.log(`  ${n}x ${m}`);
  if (smoke) console.log('\n(smoke run: size and duration are not checked, so this is not the real pass/fail)');
  console.log(verdict.pass ? '\nPASS' : `\nFAIL\n - ${verdict.failures.join('\n - ')}`);
  console.log(`\nTest data is under games/${GAME}. Delete it in the console when done${emulator ? '' : ' (staging only!)'}.`);
  process.exit(verdict.pass ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(2); });
