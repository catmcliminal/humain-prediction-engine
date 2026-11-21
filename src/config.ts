/** Runtime configuration, read from Vite env vars (see .env.example). Nothing secret lives here. */
const env = import.meta.env;
const emulator = env.VITE_USE_EMULATOR === '1';

export const config = {
  /** Change for a fresh game. Must match config/activeGame in the database for the timed raid. */
  gameId: (env.VITE_GAME_ID as string | undefined) || 'ai-2027',
  useEmulator: emulator,
  firebase: emulator
    ? { apiKey: 'demo', authDomain: 'localhost', projectId: 'demo-pe27', databaseURL: 'http://127.0.0.1:9000?ns=demo-pe27', appId: 'demo' }
    : {
        apiKey: env.VITE_FIREBASE_API_KEY as string | undefined,
        authDomain: env.VITE_FIREBASE_AUTH_DOMAIN as string | undefined,
        projectId: env.VITE_FIREBASE_PROJECT_ID as string | undefined,
        databaseURL: env.VITE_FIREBASE_DATABASE_URL as string | undefined,
        appId: env.VITE_FIREBASE_APP_ID as string | undefined,
      },
  appCheckSiteKey: env.VITE_APPCHECK_SITE_KEY as string | undefined,
  appCheckDebug: env.VITE_APPCHECK_DEBUG === '1',
  /** Database-triggered Functions must sit in the database's region; the emulator assumes us-central1. */
  functionsRegion: emulator ? 'us-central1' : 'asia-southeast1',
  /** Phone gives up waiting for the first data after this long and offers RETRY. */
  connectTimeoutMs: 10_000,
};
