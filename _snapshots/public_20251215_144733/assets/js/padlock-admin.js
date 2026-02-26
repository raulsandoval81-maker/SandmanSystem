// /public/assets/js/padlock-admin.js

import {
  db,
  collection, doc, getDoc, setDoc, updateDoc, addDoc,
  getDocs, query, orderBy, limit,
  serverTimestamp, runTransaction
} from "./firebase-init.js";

// ===== DOM =====
const $ = (id) => document.getElementById(id);
const adminKeyEl = $("adminKey");
const nameEl     = $("athleteName");   // <-- was missing
const sportEl    = $("sport");
const idEl       = $("athleteId");     // optional manual id
const mintBtn    = $("mintBtn");
const refreshBtn = $("refreshBtn");
const statusEl   = $("status");
const rowsEl     = $("rows");          // <-- was missing

const ok  = (m) => { if (statusEl) { statusEl.textContent = m; } };
const err = (m) => { if (statusEl) { statusEl.textContent = m; } console.error(m); };

// ===== Helpers =====
// Returns "A000123" from "123", "A123", "A000123" (idempotent).
function toAthleteId(raw) {
  const s = String(raw || "").trim();
  if (!s) return "";
  if (/^A\d{6}$/.test(s)) return s;                // already padded
  if (/^A\d{1,6}$/.test(s)) {
    const d = s.slice(1);
    return "A" + String(d).padStart(6, "0");
  }
  const digits = s.replace(/\D/g, "");
  if (!digits) return "";
  return "A" + String(digits).padStart(6, "0");
}

// Atomically get next number from counters/athletes { next: N }
async function mintNextId() {
  const counterRef = doc(db, "counters", "athletes");
  const padded = await runTransaction(db, async (tx) => {
    const snap = await tx.get(counterRef);
    let next = 1;
    if (snap.exists()) {
      const cur = Number(snap.data().next || 1);
      next = cur;
    }
    // Reserve current N, store next+1
    tx.set(counterRef, { next: next + 1 }, { merge: true });
    return "A" + String(next).padStart(6, "0");
  });
  return padded;
}

// ===== Actions =====
async function registerAthlete() {
  const adminKey = (adminKeyEl.value || "").trim();
  const displayName = (nameEl.value || "").trim();
  const primarySport = (sportEl.value || "").trim().toLowerCase();
  if (!adminKey)  return err("Admin key required.");
  if (!displayName) return err("Display name required.");
  if (!primarySport) return err("Primary sport required.");

  ok("Minting / registering…");

  let athleteId = toAthleteId(idEl.value);
  if (!athleteId) {
    athleteId = await mintNextId();             // A000001, A000002, ...
  }

  const ref = doc(db, "athletes", athleteId);
  await setDoc(ref, {
    displayName,
    primarySport,
    createdAt: serverTimestamp(),
    adminKey   // kept as a breadcrumb while you’re in dev
  }, { merge: true });

  ok(`Registered ${athleteId} (${displayName}).`);
  idEl.value = "";
  nameEl.value = "";
  sportEl.value = "";
  await loadRecent();
}

async function loadRecent() {
  ok("Loading…");
  rowsEl.innerHTML = "";
  const q = query(collection(db, "athletes"), orderBy("createdAt", "desc"), limit(20));
  const snap = await getDocs(q);
  snap.forEach(docSnap => {
    const d = docSnap.data() || {};
    const id = docSnap.id;
    const nm = d.displayName || "";
    const sp = d.primarySport || "";
    const when = d.createdAt?.toDate ? d.createdAt.toDate().toLocaleString() : "";
    rowsEl.insertAdjacentHTML("beforeend", `
      <tr>
        <td>${id}</td>
        <td>${nm}</td>
        <td>${sp}</td>
        <td>${when}</td>
      </tr>
    `);
  });
  ok(`Loaded ${snap.size} athletes.`);
}

// ===== Wire up =====
mintBtn.addEventListener("click", (e) => {
  e.preventDefault();
  registerAthlete().catch(e => err(e.message || String(e)));
});
refreshBtn.addEventListener("click", (e) => {
  e.preventDefault();
  loadRecent().catch(e => err(e.message || String(e)));
});

// Initial load
loadRecent().catch(e => err(e.message || String(e)));
