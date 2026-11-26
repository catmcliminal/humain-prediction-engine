# Prediction Engine v2: run-of-show (one page)

Christmas meetup, Friday 27 November 2026, 5:00 to 5:10pm, half two running into drinks.

| View | Address | Who |
|---|---|---|
| Phone | https://humain.au/predictionengine2027/ | the room (QR code) |
| Big screen | https://humain.au/predictionengine2027/#screen | projector laptop, full screen (Ctrl+Cmd+F) |
| Host panel | https://humain.au/predictionengine2027/host | you; unlock with your host word |

Backup address: https://humain-predictionengine.netlify.app/predictionengine2027/

## Before doors open
1. **Reset the quiz and ratings, keeping players, predictions and your approve/hide choices:**
   ```bash
   cd ~/Downloads/humain-prediction-engine && for p in answers answered revealed opened show votes tags; do npx firebase database:remove /games/ai-2027/$p --project predictionengine-46f43 --force; done
   ```
   Do not remove the whole game: that deletes the predictions collected so far.
2. Open the big screen. It shows **JOIN NOW** and the QR code. **Click the CLICK FOR SOUND button (top right) so it reads SOUND ON**, and turn the laptop volume up. Do this again after any reload. Keep "reduce motion" off on that laptop, or the animations will not play.
3. Open the host panel on your phone and unlock it. The state shows **ARRIVAL**.
4. Scan the big screen's QR code with a phone on mobile data. Only this code (or the address ending `?room=1`) makes predictions appear live.
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
- **Moderation:** predictions from phones that scanned the big screen's code appear live. All others show as WAITING until you tap APPROVE (or HIDE). Flagged predictions are hidden and listed first with FLAGGED. RESTORE or leave hidden. HIDE anything else.
- **Someone in the room is stuck on WAITING:** ask them to scan the big screen's code again, then post. Approve anything already sent.

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
