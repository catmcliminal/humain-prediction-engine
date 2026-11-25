# Prediction Engine: run-of-show (one page)

Room of up to 30 people. Game URL: https://humain.au/predictionengine2027/ (unlinked; the QR code is the entry).
Backup address if humain.au misbehaves: https://humain-predictionengine.netlify.app/predictionengine2027/

| View | Address | Who |
|---|---|---|
| Phone | `/predictionengine2027/` | the room (QR code) |
| Big screen | `/predictionengine2027/#screen` | projector laptop, full screen (F11 / Ctrl+Cmd+F) |
| Host | `/predictionengine2027/#host` | you, on your own phone or laptop |

There is no host PIN. Keep the host address to yourself.

## Before the event (day before, then 30 minutes before)
1. **Fresh game.** The game id is `ai-2027` (set by `VITE_GAME_ID` on Netlify and `config/activeGame` in the database; both already say `ai-2027`).
   Rehearsal data lives in the same game, so wipe it after every rehearsal, once, before doors open:
   ```bash
   cd ~/Downloads/humain-prediction-engine && npx firebase database:remove /games/ai-2027 --project predictionengine-46f43 --force
   ```
   (Do not delete `/config`.) To use a different game id instead: change `VITE_GAME_ID` in Netlify (redeploy) **and** set `config/activeGame` to the same value, or the 3-minute raid watches the wrong game.
2. **Open the big screen** on the projector laptop at `#screen`, full screen. It should show 0 players, the QR code and "AWAITING A WORTHY PREDICTION".
3. **Test the QR code** with a phone that is *not* on your Wi-Fi (mobile data). It must open the join page. Check the QR text on screen reads `humain.au/predictionengine2027`.
4. **Open `#host`** on your device. It should show HOST VIEW and zeros, with no RECONNECTING banner.
5. **Join as yourself** on a phone, post one prediction, see it on the big screen, then wipe the game again (step 1).
6. Screen and laptop: power plugged in, sleep and screen saver off, notifications off.

## During the event
- Watch the **TO REVIEW** counter on `#host`. Flagged predictions are hidden automatically and wait there: **RESTORE** if it is fine, leave hidden if not.
- **HIDE** anything else that should not be on the projector. It leaves the big screen and phone feeds at once (it is still stored).
- Callsigns on the flag list are rejected at join ("CALLSIGN NOT ALLOWED. TRY ANOTHER."); people just pick another.
- The game scrubs cards by itself (3+ shoot-downs beating the upvotes, plus a timed raid every 3 minutes on the oldest 0-vote card). Nothing for you to do.
- Levels: 1 PLAUSIBLE, 2 PROBABLE-ISH, 3 BOLD, 4 SPICY, 5 UNHINGED, 6 CYBERBONKERS (crowd-only, reached by the crowd reclassifying).
- Score = upvotes x 100 x level. Final scores show on the big screen once the game freezes.

## If something goes wrong
**Wi-Fi drops (room or venue).** Phones and screens show RECONNECTING and the buttons pause; nothing is lost, and everything resumes by itself when the network returns. Do not reload anything. If many phones are stuck, ask people to switch to mobile data (the game works on it). The big screen needs its own connection: if the projector laptop is offline, tether it to your phone.
**The big screen freezes or looks stale.** Reload `#screen` (F5). It rebuilds from the database in seconds. Nobody loses anything.
**One phone is stuck on CONNECTING.** Reload the page. If it still sticks, close the tab and rescan the QR code.
**A callsign is rejected and the person cannot find a free one.** Any other name works; letters, numbers, `_ . -` and spaces, 2 to 12 characters.
**humain.au address does not load.** Use the backup address above (make a second QR from it if needed). Players already in the game are unaffected.
**Something offensive got through.** HIDE it in `#host`. If it is on the projector right now, that is enough: it disappears within a couple of seconds.
**Total reset mid-event (last resort).** Run the wipe command in step 1; everyone must rejoin.

## The hard stop
The game **freezes at midnight 1 January 2027 (AEDT)** (`FREEZE_AT` = `1798722000000`). After that nobody can post, vote or shoot, and the big screen shows FINAL SCORES. A rehearsal after that moment will not accept posts. Changing this needs a code change and a redeploy (`npm run deploy:backend` and a Netlify push); ask Claude.

## Costs and limits
One Firebase project (Blaze, Singapore). A budget alert is meant to email you at $100 AUD (alert only, not a cap). A 30-person room is a tiny fraction of the free quota.

## Contacts and where things live
- Code: github.com/catmcliminal/humain-prediction-engine (private). Pushing to `main` redeploys the Netlify site `humain-predictionengine`.
- Firebase project: `predictionengine-46f43`. Backend deploy: `cd ~/Downloads/humain-prediction-engine && npm run deploy:backend`.
- The humain.au proxy rule is in the main site's `netlify.toml` (see `docs/SETUP.md` section 8). Never link the page from the main site.
