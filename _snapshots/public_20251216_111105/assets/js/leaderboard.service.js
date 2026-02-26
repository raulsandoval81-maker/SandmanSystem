// /public/assets/js/leaderboard.service.js
// Read-only helpers for Leaderboards (Firebase EMULATORS)

// ---- Firebase CDN (v11 ESM) ----
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-app.js";
import {
  getAuth, connectAuthEmulator, signInAnonymously
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js";
import {
  getFirestore, connectFirestoreEmulator,
  collection, getDocs
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";

// ---- Init ----
const app = initializeApp({
  apiKey: "fake-api-key",
  authDomain: "localhost",
  projectId: "sandmandashboard",
});

const auth = getAuth(app);
connectAuthEmulator(auth, "http://127.0.0.1:9099");
try { await signInAnonymously(auth); } catch (_) {}

const db = getFirestore(app);
connectFirestoreEmulator(db, "127.0.0.1", 8081);

// ---- API ----

/** Get leaderboard totals for a track/month.
 * Reads: leaderboards/{track}/{mk}/entries/athletes/*
 * Returns array sorted by totalXp DESC.
 */
export async function fetchLeaderboard(track, mk) {
  const col = collection(db, "leaderboards", track, mk, "entries", "athletes");
  const snap = await getDocs(col);
  const rows = [];
  snap.forEach(d => rows.push({ id: d.id, ...(d.data() || {}) }));
  rows.sort((a,b) => (b.totalXp || 0) - (a.totalXp || 0));
  return rows;
}

/** Get recent immutable XP log entries for a track/month (for coach view). */
export async function fetchRecentEntries(track, mk) {
  const col = collection(db, "xpLogs");
  const snap = await getDocs(col);
  const rows = [];
  snap.forEach(d => {
    const x = d.data() || {};
    if (x.track === track && x.mk === mk) rows.push({ id: d.id, ...x });
  });
  rows.sort((a,b) => (b?.ts?.seconds || 0) - (a?.ts?.seconds || 0));
  return rows;
}
