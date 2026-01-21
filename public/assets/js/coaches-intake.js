// public/assets/js/coaches-intake.js
// Find submitted intakes, render a list w/ “Load” buttons,
// mint UID + Padlock, and expose loadSubmittedIntakes() for the page.

import {
  db,
  collection, query, where, orderBy, limit, getDocs,
  doc, setDoc, serverTimestamp, runTransaction
} from "./firebase-init.js";

/* ============== tiny DOM helpers ============== */
const $ = (id) => document.getElementById(id);
const setStatus = (msg, cls = "text-ok") => {
  const el = $("ca-status");
  if (el) {
    el.className = `muted small ${cls}`;
    el.textContent = msg;
  } else {
    console.log("[status]", msg);
  }
};

/* ============== Mint helpers ============== */
// counters/<name> -> { value: N } (atomic increment)
async function nextCounter(name) {
  const ref = doc(collection(db, "counters"), name);
  return runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    const curr = snap.exists() ? (snap.data().value || 0) : 0;
    const next = curr + 1;
    tx.set(ref, { value: next }, { merge: true });
    return next;
  });
}
const formatPadlock = (seq) => `P${String(seq).padStart(6, "0")}`;
function generateUid(kind = "F8") {
  const ts = Date.now().toString(36).toUpperCase();
  const r  = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `A-${kind}-${ts}${r}`;
}

/* ============== List render ============== */
function renderList(rows) {
  const host = $("ca-list");
  if (!host) return;

  if (!rows.length) {
    host.innerHTML = `<div class="muted small">No pending intakes.</div>`;
    return;
  }

  host.innerHTML = rows.map((r) => {
    const when = r.createdAt?.toDate ? r.createdAt.toDate().toLocaleString() : "";
    return `
      <div class="row" style="align-items:center;gap:.75rem;margin:.5rem 0;">
        <div style="flex:1;min-width:12rem;">
          <div><strong>${r.first ?? ""} ${r.last ?? ""}</strong></div>
          <div class="muted small">${when}</div>
          <div class="muted small">${r.token ?? ""}</div>
        </div>
        <button class="outline-blue" data-load="${r.id}">Load</button>
      </div>
    `;
  }).join("");

  // wire Load buttons
  host.querySelectorAll("[data-load]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-load");
      const hiddenIntakeId = $("ca-uid");
      if (hiddenIntakeId) hiddenIntakeId.value = id;
      setStatus("Loaded 1 pending intake.", "text-ok");
    });
  });
}

/* ============== Firestore: find pending intakes ============== */
export async function loadSubmittedIntakes() {
  try {
    setStatus("Searching pending intakes…", "text-warn");
    const q = query(
      collection(db, "intakes"),
      where("status", "==", "submitted"),
      orderBy("createdAt", "desc"),
      limit(10)
    );
    const snap = await getDocs(q);
    const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    renderList(rows);
    console.log("[coach-intake] Loaded %d intake(s).", rows.length);
    setStatus(`Loaded ${rows.length} pending intake(s).`, "text-ok");
  } catch (err) {
    console.error("[coach-intake] find failed", err);
    setStatus("Find failed — check console.", "text-err");
  }
}

/* ============== Mint ============== */
async function doMint(kind) {
  try {
    setStatus(`Minting ${kind}…`, "text-warn");

    // 1) UID
    const uid = generateUid(kind);
    const uidInput = $("intake-uid");
    if (uidInput) uidInput.value = uid;

    // 2) Padlock
    const seq = await nextCounter("padlock");
    const pad = formatPadlock(seq);
    const padHidden = $("ca-padlock");
    const padVis    = $("intake-padlock");
    if (padHidden) padHidden.value = pad;
    if (padVis)    padVis.value = pad;

    // 3) Optional: update Track/Tier dropdown based on kind
    const trackSel = $("intake-track");
    if (trackSel) {
      trackSel.value = (kind === "F8") ? "foundry8" : "foundry4";
      // your existing fillTierOptions(trackSel.value) will run if you wired its change handler
      trackSel.dispatchEvent(new Event("change"));
    }

    console.log("[mint]", { kind, uid, pad });
    setStatus("Minted UID + Padlock", "text-ok");
  } catch (err) {
    console.error("[mint] failed", err);
    setStatus("Mint failed — check console.", "text-err");
  }
}

/* ============== Optional helpers for testing ============== */
function onMintDebug(kind) {
  return doMint(kind);
}
async function seedIntakeFor(data = {
  first: "Sampson",
  last: "Sandoval",
  token: "demo-123",
  status: "submitted",
  createdAt: serverTimestamp(),
}) {
  const ref = await setDoc(doc(collection(db, "intakes")), data);
  return ref.id; // setDoc with doc() returns void in web v10; keeping for symmetry
}

/* ============== Wire buttons when DOM is ready ============== */
window.addEventListener("DOMContentLoaded", () => {
  const findBtn = $("ca-find");
  if (findBtn) findBtn.addEventListener("click", loadSubmittedIntakes);

  const mintF8 = $("ca-mint-f8");
  const mintF4 = $("ca-mint-f4");
  if (mintF8) mintF8.addEventListener("click", () => doMint("F8"));
  if (mintF4) mintF4.addEventListener("click", () => doMint("F4"));

  console.log("[intake] Intake module ready.");
});

/* ============== Optional: expose to window for non-module callers ============== */
window.coachIntake = {
  loadSubmittedIntakes,
  seedIntakeFor,
  onMintDebug,
};
