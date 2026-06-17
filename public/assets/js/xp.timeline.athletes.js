// public/assets/js/xp.timeline.athletes.js
// Sandman XP Timeline Tool
// Modernized schema:
// - Writes uid + amount + kind
// - Keeps old athlete/xp fields for backward compatibility
// - Supports combat / strength / honor lane labeling
// - Keeps demo tool separate from authoritative incrementXp engine

import {
  collection,
  query,
  orderBy,
  limit,
  getDocs,
  addDoc,
  where,
  deleteDoc,
  doc,
  setDoc,
  serverTimestamp,
  Timestamp
} from "https://www.gstatic.com/firebasejs/10.12.3/firebase-firestore.js";

const XP_COLL = "xp_logs";

const sel =
  (id) => document.getElementById(id);

const athleteSelect =
  sel("athleteSelect");

let lastDeleted = null;

function currentAthlete() {
  const value =
    (athleteSelect?.value || "").trim();

  return value && value !== "All"
    ? value
    : "demo";
}

function normalizeUid(value = "") {
  return String(value)
    .trim()
    .toUpperCase();
}

function getLaneFromNote(note = "") {
  const n =
    String(note).toLowerCase();

  if (n.includes("strength")) return "strength";
  if (n.includes("honor")) return "honor";
  if (n.includes("arena")) return "arena";
  return "combat";
}

function getKindFromLane(lane = "combat") {
  if (lane === "strength") return "STRENGTH";
  if (lane === "honor") return "HONOR";
  if (lane === "arena") return "ARENA";
  return "DAILY_GRIND";
}

function makeXpPayload(points = 10, note = "demo click") {
  const uid =
    normalizeUid(currentAthlete());

  const lane =
    getLaneFromNote(note);

  const kind =
    getKindFromLane(lane);

  return {
    // modern fields
    uid,
    kind,
    amount: Number(points || 0),
    note,
    meta: {
      lane,
      source: "xp.timeline.athletes",
      tool: "timeline-demo",
    },

    // legacy compatibility
    athlete: uid,
    xp: Number(points || 0),

    createdAt: serverTimestamp(),
  };
}

function docData(d) {
  return {
    id: d.id,
    ...d.data(),
  };
}

function matchesCurrentAthlete(row = {}) {
  const ath =
    currentAthlete();

  if (!ath || ath === "demo") return true;

  const uid =
    normalizeUid(row.uid || row.athlete || "");

  return uid === normalizeUid(ath);
}

async function addXP(points = 10, note = "demo click") {
  try {
    const data =
      makeXpPayload(points, note);

    const ref =
      await addDoc(
        collection(db, XP_COLL),
        data
      );

    console.log("Added XP log:", ref.id, data);

    await loadLatest10();
  } catch (err) {
    console.error("Error adding XP:", err);
  }
}

sel("addXPBtn")?.addEventListener("click", () => {
  addXP(10, "Daily Grind");
});

async function loadLatest10() {
  try {
    const base =
      collection(db, XP_COLL);

    const ath =
      currentAthlete();

    let qy;

    if (ath && ath !== "demo") {
      qy =
        query(
          base,
          where("uid", "==", normalizeUid(ath)),
          orderBy("createdAt", "desc"),
          limit(10)
        );
    } else {
      qy =
        query(
          base,
          orderBy("createdAt", "desc"),
          limit(10)
        );
    }

    const snap =
      await getDocs(qy);

    let docs =
      snap.docs;

    // fallback for old logs using athlete instead of uid
    if (!docs.length && ath && ath !== "demo") {
      const legacyQ =
        query(
          base,
          where("athlete", "==", normalizeUid(ath)),
          orderBy("createdAt", "desc"),
          limit(10)
        );

      const legacySnap =
        await getDocs(legacyQ);

      docs =
        legacySnap.docs;
    }

    renderFeed(docs);
    renderTotals(docs);
  } catch (err) {
    console.error("Error loading latest:", err);
  }
}

sel("loadLatestBtn")?.addEventListener("click", loadLatest10);
athleteSelect?.addEventListener("change", loadLatest10);

async function deleteLast() {
  try {
    const base =
      collection(db, XP_COLL);

    const ath =
      currentAthlete();

    const qy =
      ath && ath !== "demo"
        ? query(
            base,
            where("uid", "==", normalizeUid(ath)),
            orderBy("createdAt", "desc"),
            limit(1)
          )
        : query(
            base,
            orderBy("createdAt", "desc"),
            limit(1)
          );

    const snap =
      await getDocs(qy);

    if (snap.empty) return;

    const d =
      snap.docs[0];

    lastDeleted = {
      id: d.id,
      data: d.data(),
    };

    await deleteDoc(
      doc(db, XP_COLL, d.id)
    );

    if (sel("undoBtn")) {
      sel("undoBtn").disabled = false;
    }

    await loadLatest10();
  } catch (err) {
    console.error("Error deleting last:", err);
  }
}

sel("deleteLastBtn")?.addEventListener("click", deleteLast);

async function undoDelete() {
  try {
    if (!lastDeleted) return;

    const { id, data } =
      lastDeleted;

    if (data.createdAt && !(data.createdAt instanceof Timestamp)) {
      data.createdAt =
        Timestamp.fromDate(new Date());
    }

    await setDoc(
      doc(db, XP_COLL, id),
      data
    );

    lastDeleted = null;

    if (sel("undoBtn")) {
      sel("undoBtn").disabled = true;
    }

    await loadLatest10();
  } catch (err) {
    console.error("Error undoing delete:", err);
  }
}

sel("undoBtn")?.addEventListener("click", undoDelete);

// Optional helpers for console testing
window.SandmanTimelineXP = {
  addXP,
  loadLatest10,
  currentAthlete,
};