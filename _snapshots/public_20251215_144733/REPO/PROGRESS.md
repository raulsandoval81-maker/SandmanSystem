# Firebase 45-Day Grind Plan
Sandman System • Core → Secure → Prestige  
Goal: Ship a live, durable system with clean Firebase wiring.  
--## Phase 1 – Lock the Core (Days 1–15)  

### ✅ Week 1 Checkpoint (Day 7)  
- XP test page wired  
- First dummy athlete data visible in Firestore  
- Basic retreat/proceed loop works  

### ✅ Week 2 Checkpoint (Day 14)  
- XP table page showing last 50 entries  
- Second XP page (e.g., Kickboxing) live  
- Ladder JSON connected  

---
## Phase 2 – Expand & Secure (Days 16–30)  

### ✅ Week 3 Checkpoint (Day 21)  
- Intake form live and writing to Firestore  
- Contact form connected  
- Redirect to /thanks pages working  

### ✅ Week 4 Checkpoint (Day 28)  
- Volunteer form live  
- Leaderboard showing totals per athlete  
- Mobile styling polished  
---
## Phase 3 – Prestige & Polish (Days 31–45)  

### ✅ Week 5 Checkpoint (Day 35)  
- 3rd XP program wired (Wrestling/Kickboxing/MMA)  
- Logs validated in Firestore  
- XP ladder visuals confirmed  

### ✅ Week 6 Checkpoint (Day 42)  
- AI/summary hooks ready (basic alerts or digest)  
- Coach Leaderboard fully functional  
- Snapshot/motivation wall connected  

---
# Firebase 45-Day Grind Plan  
### 🏁 Final Checkpoint (Day 45)  
- System end-to-end: XP logs, intake, contact, volunteer, ladders, snapshots, and leaderboards all wired and tested.  
- Celebrate: Firebase Core secure, Sandman System prestige-ready.  


**Sandman System — Core → Secure → Prestige**  
Goal: Ship a live, durable system with clean Firebase wiring.

      ABOVE WEEK BY WEEK OPORATIONS NEXT 7 WEEKS

      BELOW DAY BY DAY OPERATIONS NEXT 45 DAYS

## Phase 1 — Lock the Core (Days 1–15)

- **Day 1:** Create `/public/assets/js/firebase-init.js` with config. Replace page-local configs with import. Deploy hosting sanity check.  
- **Day 2:** Verify `/robots.txt`, noindex on `/admin` + `/sandbox`. Phone tap-through.  

- **Day 3:** Build XP page `/combat/youth/xp-youth.html`. Add XP log write to Firestore.  
- **Day 4:** Test XP log writes with dummy athlete. Confirm in Firestore.  
- **Day 5:** Wire `xp-youth.service.js`. Add notes + timestamps.  

- **Day 6:** Create XP table page `/tools/xp-table.html`. Show last 50 entries.  
- **Day 7:** Add query filter by program + order by timestamp.  
- **Day 8:** Add CSV export option. Verify on phone.  

- **Day 9:** Build second XP page `/combat/kickboxing/xp-kickboxing.html`.  
- **Day 10:** Wire Firestore collection for Kickboxing.  
- **Day 11:** Verify both Wrestling + Kickboxing XP flows.  
- **Day 12:** Cross-check table view shows both programs.  

- **Day 13:** Create `/assets/js/ladder-map.js`. Map XP → Tier.  
- **Day 14:** Add tier colors + text for Youth and Foundry4.  
- **Day 15:** Show computed tier in XP page + XP table. End of Phase 1.

---
# Firebase 45-Day Grind Plan  
## Phase 2 — Expand + Secure (Days 16–30)

- **Day 16:** Build intake form page `/intake.html`.  
- **Day 17:** Cloud Function `intake` → saves to `intake_submissions`.  
- **Day 18:** Redirect to `/thanks/intake.html`. Test end-to-end.  

- **Day 19:** Build contact form `/contact.html`.  
- **Day 20:** Function `contact` → saves to `contact_submissions`.  
- **Day 21:** Redirect to `/thanks/contact.html`. Add honeypot field.  

- **Day 22:** Build volunteer form `/volunteer.html`.  
- **Day 23:** Function `volunteer` → saves to `volunteer_submissions`.  
- **Day 24:** Redirect to `/thanks/volunteer.html`. Add throttling.  

- **Day 25:** Coaches leaderboard `/coaches/leaderboard.html`. Show XP totals per athlete.  
- **Day 26:** Add sorting + pagination. Verify across 2 programs.  
- **Day 27:** Style leaderboard for mobile.  

- **Day 28:** Athlete snapshot `/coaches/snapshot.html`. Show last N entries per athlete.  
- **Day 29:** Show current tier + XP progress bar.  
- **Day 30:** Firestore rules polish. Lock submissions. Role-guard. Emulator test.

---

## Phase 3 — Prestige Polish (Days 31–45)

- **Day 31:** Ceremony panel `/coaches/ceremony.html`. Log tier promotions.  
- **Day 32:** Add coach signature + timestamp.  
- **Day 33:** Export/print certificate option.  

- **Day 34:** Add XP decay alert logic. Banner if no XP > X days.  
- **Day 35:** Tune thresholds (Youth vs Teen). Test on dummy.  
- **Day 36:** Deploy banner to XP pages.  

- **Day 37:** Motivation Wall `/tools/motivation.html`.  
- **Day 38:** Collection `motivation_posts`. Input + display.  
- **Day 39:** Style wall for big-screen projection.  

- **Day 40:** Challenge tracker `/tools/challenges.html`. Fixed XP chunks.  
- **Day 41:** Add tags by program.  
- **Day 42:** Log to `challenge_logs`. Test with dummy athlete.  

- **Day 43:** System polish pass. Ensure pill buttons (Proceed/Retreat) are consistent across tour.  
- **Day 44:** Smoke test: no 404s, images load, tour loop flows.  
- **Day 45:** Deploy hosting, functions, rules. Tag release: `BASE_85_SelfSufficient`.

---
# Firebase 45-Day Grind Plan  
## Daily Sanity Check
- Proceed/Retreat pill buttons present.  
- Footer block matches across tour.  
- XP logs write to Firestore with ts.  
- Leaderboard sorts & paginates.  
- Submissions not publicly readable.  
- Images load on phone, case-sensitive.

---
# Firebase 45-Day Grind Plan  

## Collections
- `xp_logs: { uid, program, tier, xp, note, ts }`  
- `contact_submissions: { name, email, subject, message, ts }`  
- `volunteer_submissions: { name, email, interest, notes?, ts }`  
- `intake_submissions: { name, role, email, phone?, notes?, ts }`  
- `ceremonies: { athleteId, program, fromTier, toTier, byCoach, ts }`

---

## Commands
- Deploy hosting: `firebase deploy --only hosting`  
- Deploy all functions: `firebase deploy --only functions`  
- Deploy single fn: `firebase deploy --only functions:intake`  
- Deploy rules: `firebase deploy --only firestore:rules`

---

## Version Tags
- `phase-38-foundations`  
- `phase-39-xp-youth`  
- `phase-40-combat`  
- `phase-41-dash`  
- `BASE_85_SelfSufficient`
