Got it — here’s your **Firebase\_45Day\_Plan.md** in pure Markdown format so you can drop it straight into your repo or Notes.

````markdown
# FIREBASE_45DAY_PLAN.md
**Sandman System — 45-Day Grind (Core → Secure → Prestige)**  
Goal: ship a live, durable system with clean Firebase wiring.

-# Firebase 45-Day Progress Tracker  

| Week | Dates     | Focus                         | Checkpoint Goals                                                                 | Status |
|------|-----------|-------------------------------|----------------------------------------------------------------------------------|--------|
| 1    | Days 1–7  | Lock Core – Start             | ✅ XP test page wired<br>✅ Dummy athlete in Firestore<br>✅ Retreat/Proceed loop | [ ]    |
| 2    | Days 8–14 | Lock Core – Expand            | ✅ XP table 50 entries<br>✅ Kickboxing XP page<br>✅ Ladder JSON connected       | [ ]    |
| 3    | Days 15–21| Expand – Forms Intake         | ✅ Intake form live<br>✅ Contact form live<br>✅ Redirects to /thanks pages     | [ ]    |
| 4    | Days 22–28| Expand – Volunteer & Leader   | ✅ Volunteer form live<br>✅ Leaderboard totals<br>✅ Mobile styling polish      | [ ]    |
| 5    | Days 29–35| Prestige – XP Programs        | ✅ 3rd XP program wired<br>✅ Logs validated<br>✅ Ladder visuals confirmed       | [ ]    |
| 6    | Days 36–42| Prestige – AI & Snapshots     | ✅ Alerts/digests<br>✅ Coach leaderboard full<br>✅ Motivation wall connected   | [ ]    |
| 7    | Days 43–45| Final Wrap-Up                 | ✅ End-to-end check<br>✅ XP + forms + ladder all live<br>🏁 Celebrate           | [ ]    |

---
--

## Phase 1 — Lock the Core (Days 1–15)
**Outcome:** one XP flow fully wired end-to-end, shared Firebase init, stable tour.

### Day 1–2 — Baseline + Init
- [ ] Create `/public/assets/js/firebase-init.js` with your config (ESM).
- [ ] Replace page-local configs with:  
  `import { app, auth, db } from "../assets/js/firebase-init.js";`
- [ ] `firebase deploy --only hosting` (sanity check on phone).
- [ ] Robots.txt & noindex verified on `/admin`, `/sandbox`.

### Day 3–5 — First XP Page (Youth Wrestling)
- [ ] Page: `/public/combat/youth/xp-youth.html`
- [ ] Service: `/public/combat/youth/xp-youth.service.js`
- [ ] Collection: `xp_logs` with:
  ```json
  {
    "uid":"<user>",
    "program":"wrestling",
    "tier":"Warrior",
    "xp":25,
    "note":"Drill A",
    "ts":"<serverTimestamp>"
  }
````

* [ ] Verify writes appear in Firestore.

### Day 6–8 — Read Views + Table

* [ ] `/public/tools/xp-table.html` shows last 50 entries.
* [ ] Query: `xp_logs` ordered by `ts desc`, filter by `program`.
* [ ] Add simple CSV export.

### Day 9–12 — Second XP Page (Kickboxing)

* [ ] Mirror Youth Wrestling structure for `kickboxing`.
* [ ] Reuse shared components (no duplicate logic).

### Day 13–15 — Ladder Mapping

* [ ] `/public/assets/js/ladder-map.js`
* [ ] Exports:

  * `pointsToTier(program, totalXp)`
  * `tierColors[tierName]`
* [ ] Show computed tier on XP pages and in table.

---

## Phase 2 — Expand + Secure (Days 16–30)

**Outcome:** intake + contact + volunteer wired, leaderboard + snapshot, rules tight.

### Day 16–18 — Intake

* [ ] Cloud Function `intake` saves form to `intake_submissions`.
* [ ] Redirect to `/thanks/intake.html`.

### Day 19–21 — Contact & Volunteer

* [ ] Functions: `contact`, `volunteer` → their collections.
* [ ] Throttle by IP+path, honeypot `_hp`.

### Day 22–24 — Coaches Leaderboard

* [ ] `/public/coaches/leaderboard.html`
* [ ] Aggregate XP by athlete/program.
* [ ] Sorting & pagination.

### Day 25–27 — Athlete Snapshot

* [ ] `/public/coaches/snapshot.html`
* [ ] Shows last N entries + current tier.

### Day 28–30 — Firestore Rules

* [ ] Lock collections: no public reads on submissions.
* [ ] Role guard: writes via functions only.
* [ ] Emulator test of rules.

---

## Phase 3 — Prestige Polish (Days 31–45)

**Outcome:** ceremonies tooling, decay alerts, motivation, challenges, polish.

### Day 31–33 — Ceremony Panel

* [ ] `/public/coaches/ceremony.html`
* [ ] Marks tier award → `ceremonies` doc.
* [ ] Optional: print/export certificate.

### Day 34–36 — XP Decay Alerts

* [ ] Client banner when last activity > X days.
* [ ] Read-only, no auto-writes.

### Day 37–39 — Motivation Wall

* [ ] `/public/tools/motivation.html`
* [ ] Collection `motivation_posts`.

### Day 40–42 — Challenge XP Mini-Tracker

* [ ] `/public/tools/challenges.html`
* [ ] Fixed XP chunks, tagged by program.

### Day 43–45 — Polish + Lock

* [ ] Pill buttons (Proceed/Retreat) consistent.
* [ ] Footer block identical across tour.
* [ ] Smoke test: no 404s, images load.
* [ ] Deploy hosting, functions, rules.
* [ ] Tag: `BASE_85_SelfSufficient`.

---

## Folder Conventions

```
public/
  assets/
    css/site.css
    img/
    js/
      firebase-init.js
      ladder-map.js
  tour/
    index.html
    tour-system.html
    ...
  coaches/
    leaderboard.html
    snapshot.html
    ceremony.html
  combat/
    youth/xp-youth.html
    teen/xp-teen.html
  tools/
    xp-table.html
    motivation.html
  thanks/
    contact.html
    volunteer.html
    intake.html
functions/
  index.js
  package.json
firestore.rules
firebase.json
```

---

## Commands

* Hosting: `firebase deploy --only hosting`
* Functions: `firebase deploy --only functions`
* Single fn: `firebase deploy --only functions:intake`
* Rules: `firebase deploy --only firestore:rules`

---

## Daily Sanity Checklist

* [ ] Tour index has a **Proceed** pill.
* [ ] Each tour page has **Proceed/Retreat** + footer.
* [ ] XP logs write to `xp_logs` with timestamps.
* [ ] Leaderboard reads and sorts.
* [ ] No public read on submissions.
* [ ] Images load on phone (case OK).

---

## Schemas

```
xp_logs: { uid, program, tier, xp, note, ts }
contact_submissions: { name, email, phone?, subject, message, ts }
volunteer_submissions: { name, email, interest, notes?, ts }
intake_submissions: { name, role, email, phone?, notes?, ts }
ceremonies: { athleteId, program, fromTier, toTier, byCoach, ts }
```

---

## Version Tags

* `phase-38-foundations`
* `phase-39-xp-youth`
* `phase-40-combat`
* `phase-41-dash`
* `BASE_85_SelfSufficient`

---

## Blunt Reminders

* Shared **firebase-init.js** kills 80% of bugs.
* Paths must be **relative** in `/tour/`.
* Assets are **case-sensitive**.
* Start with **one XP page**.
* Don’t expose submissions: **rules first**.

```

Want me to also spin up a matching `PROGRESS.md` so you can tick daily boxes as you grind through this?
```
