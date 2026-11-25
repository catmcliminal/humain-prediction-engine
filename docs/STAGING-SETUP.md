# Staging setup (Milestone 6)

You do these in the consoles; Claude does the repo side. Nothing here touches humain.au.
Staging is a separate Firebase project from production (production comes in M7).

## 1. Firebase project (staging)
1. https://console.firebase.google.com > **Add project**. Name: `humain-prediction-engine-staging`. Turn **Google Analytics off**.
2. Bottom-left **Upgrade** > **Blaze** > pick your billing account. (Scheduled Functions need Blaze. You own billing.)

## 2. Budget alert ($100 AUD, emailed to you)
1. https://console.cloud.google.com/billing > pick the billing account > **Budgets & alerts** > **Create budget**.
2. Name `PE27 staging`. Scope: **Projects** = the staging project. Services: all.
3. Amount: **Specified amount**, `100`, currency AUD (use your billing currency if AUD is not offered).
4. Thresholds: 50%, 90%, 100% (actual). Under **Notifications**, keep "Email alerts to billing admins and users" ticked.
5. **Finish**. A budget only alerts; it does not stop spending (as agreed, no hard cap).
Repeat for the production project in M7.

## 3. Realtime Database (Singapore)
Build > **Realtime Database** > **Create database** > location **Singapore (asia-southeast1)** > **Locked mode**.
Copy the database URL (looks like `https://<project>-default-rtdb.asia-southeast1.firebasedatabase.app`).

## 4. Authentication
Build > **Authentication** > **Get started** > **Sign-in method** > **Anonymous** > enable.
Settings > **Authorised domains** > add `humain.au` and `www.humain.au` (and your Netlify site domain once it exists).

## 5. Web app config
Project settings (gear) > **Your apps** > **</>** web > nickname `Prediction Engine web` (no Hosting).
Copy `apiKey`, `authDomain`, `projectId`, `appId`. (Not secret; they end up in the page.)

## 6. App Check
1. https://www.google.com/recaptcha/admin > **Create** > label `PE27 staging`, type **reCAPTCHA v3**, domains: `humain.au`, `www.humain.au`, your Netlify site domain (and `localhost` for local testing). Copy the **site key** and **secret key**.
2. Firebase > **App Check** > **Apps** > your web app > **reCAPTCHA** > paste the **secret key**.
3. Same page, **Manage debug tokens** > **Add debug token** > generate one and copy it (for the load test only).
4. Do NOT click Enforce yet. We turn it on for Realtime Database and Cloud Functions after the page works on staging.

## 7. Service account key (load test only)
Project settings > **Service accounts** > **Generate new private key**. Save it OUTSIDE the repo (e.g. `~/keys/pe27-staging.json`).
Never paste it into chat, commit it or reuse it for production. Delete it after the test.

## 8. Host PIN
Make a long random PIN (8+ chars, no spaces, quotes or backslashes) and keep it in your password manager:
```bash
openssl rand -base64 18 | tr -d '/+=\n'
```

## 9. Tell Claude
Send: the staging **project ID**, and that steps 1 to 7 are done. Do NOT send the key, the PIN or the secret key.
Claude will then add `.firebaserc`, and ask before running the first deploy of rules and Functions.

## 10. GitHub and Netlify (after the Firebase part)
1. Create an empty **private** GitHub repo `humain-prediction-engine` (no README). Tell Claude the URL; Claude asks before pushing.
2. Netlify > **Add new site** > **Import an existing project** > pick that repo. A NEW site, not the humain.au one.
   Build command `npm run build`, publish directory `dist`.
3. Site configuration > **Environment variables** > add with scope **Deploy Previews** (and Branch deploys):
   `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_DATABASE_URL`, `VITE_FIREBASE_APP_ID`, `VITE_APPCHECK_SITE_KEY` (the reCAPTCHA **site** key), `VITE_GAME_ID`.
   Leave the Production scope empty until M7.
