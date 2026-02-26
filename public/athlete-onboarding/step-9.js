// ======================================================
// Athlete Onboarding — Step 9 (Complete / Snapshot)
// Reads/Writes: athletes/{uid}
// Redirect: /athletes/hub (NOT tools)
// ======================================================

import {
  db,
  doc,
  getDoc,
  updateDoc,
  serverTimestamp,
} from "../assets/js/firebase-init.js";

const $ = (id) => document.getElementById(id);

// URL param: ?id=F4_TEST_GHOST_01 (also accepts ?uid=)
const params = new URLSearchParams(window.location.search);
const uid = (params.get("id") || params.get("uid") || "").trim().toUpperCase();

const statusEl = $("status");
const btnComplete = $("btn-complete");
const btnBack = $("btn-back");

function setStatus(t) {
  if (statusEl) statusEl.textContent = t || "";
}

function setText(id, value) {
  const el = $(id);
  if (!el) return;
  el.textContent = (value === undefined || value === null || value === "") ? "—" : String(value);
}

function safeJoin(a, b, sep = ", ") {
  const A = (a || "").toString().trim();
  const B = (b || "").toString().trim();
  if (A && B) return `${A}${sep}${B}`;
  return A || B || "—";
}

let athlete = null;

async function loadSnapshot() {
  if (!uid) {
    setStatus("Missing ?id=. Ask your coach for a new link.");
    if (btnComplete) btnComplete.disabled = true;
    return;
  }

  setStatus("Loading…");

  const ref = doc(db, "athletes", uid);
  const snap = await getDoc(ref);

  if (!snap.exists()) {
    setStatus("Athlete not found. Check the link from coach.");
    if (btnComplete) btnComplete.disabled = true;
    return;
  }

  athlete = snap.data() || {};

  // Name
  const name = athlete.fullName || athlete.publicName || "—";
  setText("sum-name", name);

  // UID
  setText("sum-uid", athlete.uid || uid);

  // Track / Tier
  const track = athlete.trackCode || athlete.track || "—";
  const tier  = athlete.tier || "—";
  setText("sum-tracktier", `${track} / ${tier}`);

  // Team / City, State
  const team =
    athlete.team?.name ||
    athlete.team ||
    athlete.location?.team ||
    "—";

  const city =
    athlete.team?.city ||
    athlete.city ||
    athlete.location?.city ||
    "—";

  const state =
    athlete.team?.state ||
    athlete.state ||
    athlete.location?.state ||
    "—";

  setText("sum-teamloc", `${team} / ${safeJoin(city, state)}`);

  // Scores (onboarding.selfAssess)
  const sa = athlete.onboarding?.selfAssess || {};

  const parts = [];
  if (Number.isFinite(Number(sa.honor)))   parts.push(`Honor ${sa.honor}/10`);
  if (Number.isFinite(Number(sa.strong)))  parts.push(`Strong ${sa.strong}/10`);
  if (Number.isFinite(Number(sa.fast)))    parts.push(`Fast ${sa.fast}/10`);
  if (Number.isFinite(Number(sa.smart)))   parts.push(`Smart ${sa.smart}/10`);
  if (Number.isFinite(Number(sa.courage))) parts.push(`Courage ${sa.courage}/10`);
  setText("sum-scores", parts.length ? parts.join(" · ") : "—");

  // Finisher (boolean)
  if (typeof sa.finisher === "boolean") {
    setText("sum-finisher", sa.finisher ? "Yes" : "No");
  } else {
    setText("sum-finisher", "—");
  }

  // ✅ Childhood Hero (Step 8 writes onboarding.identity.childhoodHero)
const hero = athlete.onboarding?.identity?.childhoodHero;
const legend = athlete.onboarding?.identity?.futureLegend;
setText("sum-hero", [hero, legend].filter(Boolean).join(" · ") || "—");

  setStatus("");
}

loadSnapshot().catch((e) => {
  console.error(e);
  setStatus("Error loading snapshot.");
  if (btnComplete) btnComplete.disabled = true;
});

// Back → Step 8
btnBack?.addEventListener("click", () => {
  if (!uid) return;
  window.location.href = `/athlete-onboarding/step-8.html?id=${encodeURIComponent(uid)}`;
});

// Seal → Hub
btnComplete?.addEventListener("click", async () => {
  if (!uid) return;

  try {
    btnComplete.disabled = true;
    setStatus("Sealing…");

    await updateDoc(doc(db, "athletes", uid), {
      "onboarding.version": "v1",
      "onboarding.status": "complete",
      "onboarding.step": 9,
      "onboarding.completedAt": serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    window.location.href = `/athletes/hub?id=${encodeURIComponent(uid)}`;
  } catch (e) {
    console.error(e);
    setStatus("Seal failed. Check console.");
    btnComplete.disabled = false;
  }
});
