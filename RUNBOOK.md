# Prediction Engine v2: run-of-show (one page)

Christmas meetup, Friday 27 November 2026, 5:00 to 5:10pm, half two running into drinks.

| View | Address | Who |
|---|---|---|
| Phone | https://humain.au/predictionengine2027/ | the room (QR code) |
| Big screen | https://humain.au/predictionengine2027/#screen | projector laptop, full screen (Ctrl+Cmd+F) |
| Host panel | https://humain.au/predictionengine2027/host | you; unlock with your host word |

Backup address: https://humain-predictionengine.netlify.app/predictionengine2027/

## Before doors open
1. **Wipe rehearsal data and reload the deck** (do this after your last rehearsal):
   ```bash
   cd ~/Downloads/humain-prediction-engine && npx firebase database:remove /games/ai-2027 --project predictionengine-46f43 --force && npm run content
   ```
   This also locks the host panel again, so type your word once more.
2. Open the big screen. It shows **JOIN NOW** and the QR code. **Click the CLICK FOR SOUND button (top right) so it reads SOUND ON**, and turn the laptop volume up. Do this again after any reload. Keep "reduce motion" off on that laptop, or the animations will not play.
3. Open the host panel on your phone and unlock it. The state shows **ARRIVAL**.
4. Scan the QR code with a phone on mobile data.
5. Laptop on power, sleep and notifications off.

## The show (host panel buttons)
| When | Tap | The room sees |
|---|---|---|
| Arrivals | ARRIVAL | Join, then three warm-up cards at their own pace |
| Break before the quiz | PAUSED | "Back at 5" and their score |
| 5:00 quiz | LIVE QUIZ, then NEXT CARD | Card and 20 second countdown |
| Each card | REVEAL | Answer on screen and phones together, % who got it right |
| (fake cards) | | Phones ask "true by end of 2027?" Give people a moment |
| After card 6 | RESULTS | Myth-buster top 10 |
| Half two | PREDICT | Fakes appear as seed predictions; write, rate 1 to 5 (CERTAIN to UNHINGED), CYBERBONKERS |

- Leaving arrival for LIVE QUIZ closes the warm-up cards and counts their scores.
- **False start:** RESET QUIZ (tap twice). Wipes live answers and scores; warm-up scores stay.
- **A card falls flat:** ALL CARDS, then SHOW a reserve card.
- **FREEZE** (tap twice) locks the board early. PREDICT reopens it. The real freeze is automatic at midnight on New Year's Eve, Sydney time.
- **Moderation:** flagged predictions are hidden and listed first with FLAGGED. RESTORE or leave hidden. HIDE anything else.

## If something goes wrong
- **Wi-Fi drops:** screens show RECONNECTING and recover by themselves. Ask people to use mobile data. Tether the projector laptop if needed.
- **Big screen looks stale:** reload it. Nothing is lost.
- **A phone is stuck:** reload. Same phone keeps the same nickname and score.
- **Nickname taken or refused:** pick another (2 to 20 characters; letters, numbers, space, _ . -).
- **humain.au fails:** use the backup address.

## After the event
- Set `minInstances` to 0 in `functions/src/index.ts` and redeploy, to stop the small idle cost of the warm join function.
- Do not run the wipe command again: predictions must stay until New Year.
- Roll back to v1 if ever needed: git tag `v1-live` (redeploy rules and Functions from it, and revert `main`).
