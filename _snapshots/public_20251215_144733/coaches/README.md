# Sandman System™ — Athletes Folder

This folder holds all **Athlete Live Log** pages.  
Logs are split into **three separate HTML files** for clarity, performance, and Firebase wiring.

---

## 📂 Files

### 1. `athlete-live-log.html`
- **Purpose:** Input form for creating new log entries.
- **Current state:** Uses `localStorage` for demo.
- **Future:** Will write to Firestore (`athleteLogs` collection).
- **Notes:**
  - Fields: athlete, coach, program, discipline, type, topic, text, tier, visibility.
  - Links directly to `athlete-log-history.html` after save.

### 2. `athlete-log-history.html`
- **Purpose:** Read-only stream of all entries.
- **Current state:** Pulls from `localStorage`, filterable by search, type, program, discipline, and date range.
- **Future:** Will use `onSnapshot()` queries against Firestore with composite indexes.
- **Notes:**
  - Links each row to `athlete-log-details.html?id=…`.

### 3. `athlete-log-details.html`
- **Purpose:** Show a single record in detail view.
- **Current state:** Looks up entry by `ts` (timestamp used as ID in demo).
- **Future:** Will look up Firestore document by ID.
- **Notes:**
  - Displays all fields: athlete, coach, program, discipline, type, topic, tier, visibility, notes.
  - Returns to `athlete-log-history.html`.

---

## 🔮 Wiring Plan (Firebase)

- Collection: **`athleteLogs`**
- Example schema:
  ```js
  {
    ts: serverTimestamp(),
    athlete: "sandoval",
    coach: "reyes",
    program: "foundry8",
    discipline: "wrestling",
    type: "note", // note | assignment | praise | correction
    topic: "double leg",
    text: "Keep hips low on entry.",
    tier: "warrior",
    visibility: "team", // team | public | private
    createdBy: uid
  }
