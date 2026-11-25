# Setup for a live room of up to 30 (one Firebase project, one Netlify site)

You do these in the consoles. Claude does the repo side and asks before any deploy or push.
The game lives at https://humain.au/predictionengine2027/ as an unlinked ("orphan") page.

## 1. Firebase project
1. https://console.firebase.google.com > **Add project** > `humain-prediction-engine`. Google Analytics **off**.
2. **Upgrade** to **Blaze** (scheduled Functions need it). You own billing.

## 2. Budget alert ($100 AUD, emailed to you)
Google Cloud console > **Billing** > **Budgets & alerts** > **Create budget**: scope = this project, amount `100` AUD,
thresholds 50% / 90% / 100%, email notifications on. It alerts only; it does not cap spend.

## 3. Realtime Database
Build > **Realtime Database** > **Create database** > **Singapore (asia-southeast1)** > **Locked mode**.
Copy the database URL.

## 4. Authentication
Build > **Authentication** > **Get started** > **Sign-in method** > **Anonymous** > enable.
**Settings > Authorised domains**: add `humain.au` and `www.humain.au`.

## 5. Web app config
Project settings > **Your apps** > **</>** > nickname `Prediction Engine web` (no Hosting).
Copy `apiKey`, `authDomain`, `projectId`, `appId` (not secret).

## 6. Host PIN
8+ characters, no spaces, quotes or backslashes. Keep it in your password manager:
```bash
openssl rand -base64 18 | tr -d '/+=\n'
```

## 7. Tell Claude
Send the project ID, database URL and the four config values. Not the PIN.
Claude adds `.firebaserc` and asks before deploying the rules and Functions.

## 8. GitHub + Netlify (new site for the game)
1. Empty private GitHub repo `humain-prediction-engine`; tell Claude the URL (Claude asks before pushing).
2. Netlify > **Add new site** > import that repo. Build `npm run build`, publish `dist`.
3. Environment variables (all scopes): `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`,
   `VITE_FIREBASE_DATABASE_URL`, `VITE_FIREBASE_APP_ID`, `VITE_GAME_ID`.
   (App Check is left off for the first event: no `VITE_APPCHECK_SITE_KEY`.)

## 9. humain.au rule (only you apply this; Claude does not touch the main site)
In the humain.au site's `netlify.toml`, with `GAME-SITE` the game site's Netlify name:
```toml
[[redirects]]
  from = "/predictionengine2027"
  to = "/predictionengine2027/"
  status = 301
  force = true

[[redirects]]
  from = "/predictionengine2027/*"
  to = "https://GAME-SITE.netlify.app/predictionengine2027/:splat"
  status = 200
  force = true
```
Don't link to the page from the main site's navigation; the QR code is the entry point.
