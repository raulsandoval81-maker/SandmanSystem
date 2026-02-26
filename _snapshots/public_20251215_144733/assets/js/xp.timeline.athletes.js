// ---- imports you already have ----
import {
  collection, query, orderBy, limit, getDocs, addDoc,
  where, deleteDoc, doc, setDoc, serverTimestamp, Timestamp
} from "https://www.gstatic.com/firebasejs/10.12.3/firebase-firestore.js";

const XP_COLL = "xp_logs";
const sel = id => document.getElementById(id);
const athleteSelect = sel("athleteSelect");

// keep last deletion for undo
let lastDeleted = null;

// current athlete helper
function currentAthlete() {
  return (athleteSelect?.value || "demo").trim();
}

// --- ADD XP uses selected athlete ---
async function addXP(points = 10, note = "demo click") {
  try {
    const data = {
      athlete: currentAthlete() === "All" ? "demo" : currentAthlete(),
      xp: points,
      note,
      createdAt: serverTimestamp()
    };
    const ref = await addDoc(collection(db, XP_COLL), data);
    console.log("Added document with ID:", ref.id);
    await loadLatest10(); // refresh list/totals
  } catch (err) {
    console.error("Error adding XP:", err);
  }
}

// wire existing +10 button if not already
sel("addXPBtn")?.addEventListener("click", () => addXP(10));

// --- Load latest (respects athlete filter) ---
async function loadLatest10() {
  try {
    const base = collection(db, XP_COLL);
    const ath = currentAthlete();
    const q = ath && ath !== "All"
      ? query(base, where("athlete","==", ath), orderBy("createdAt","desc"), limit(10))
      : query(base, orderBy("createdAt","desc"), limit(10));

    const snap = await getDocs(q);
    const docs = snap.docs;

    renderFeed(docs);
    renderTotals(docs);
  } catch (err) {
    console.error("Error loading latest:", err);
  }
}
sel("loadLatestBtn")?.addEventListener("click", loadLatest10);
athleteSelect?.addEventListener("change", loadLatest10);

// --- Delete last (most recent for selection) ---
async function deleteLast() {
  try {
    const base = collection(db, XP_COLL);
    const ath = currentAthlete();
    const q = ath && ath !== "All"
      ? query(base, where("athlete","==", ath), orderBy("createdAt","desc"), limit(1))
      : query(base, orderBy("createdAt","desc"), limit(1));

    const snap = await getDocs(q);
    if (snap.empty) return;

    const d = snap.docs[0];
    lastDeleted = { id: d.id, data: d.data() };
    await deleteDoc(doc(db, XP_COLL, d.id));
    sel("undoBtn").disabled = false;

    await loadLatest10();
  } catch (err) {
    console.error("Error deleting last:", err);
  }
}
sel("deleteLastBtn")?.addEventListener("click", deleteLast);

// --- Undo last delete (restores same ID + timestamp) ---
async function undoDelete() {
  try {
    if (!lastDeleted) return;
    const { id, data } = lastDeleted;

    // preserve original timestamp if it exists
    if (data.createdAt && !(data.createdAt instanceof Timestamp)) {
      // leave as-is (Firestore will accept Timestamp or Date); if it was a serverTimestamp,
      // we can’t reconstruct it exactly, so fallback to now.
      data.createdAt = Timestamp.fromDate(new Date());
    }

    await setDoc(doc(db, XP_COLL, id), data);
    lastDeleted = null;
    sel("undoBtn").disabled = true;

    await loadLatest10();
  } catch (err) {
    console.error("Error undoing delete:", err);
  }
}
sel("undoBtn")?.addEventListener("click", undoDelete);
