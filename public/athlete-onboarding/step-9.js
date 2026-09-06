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
  ensureSignedIn
} from "/assets/js/firebase-init.js";
import { day1SnapshotView, resolveOnboardingTemplate } from "./onboarding-templates.js";

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
    if (btnBack) btnBack.disabled = true;
    return;
  }

  setStatus("Loading…");

  // 🔐 REQUIRED so request.auth exists (phone)
  await ensureSignedIn();

  const ref = doc(db, "athletes", uid);
  const snap = await getDoc(ref);

  if (!snap.exists()) {
    setStatus("Athlete not found. Check the link from coach.");
    if (btnComplete) btnComplete.disabled = true;
    if (btnBack) btnBack.disabled = true;
    return;
  }

  athlete = snap.data() || {};
  const resolved = resolveOnboardingTemplate(athlete);
  const day1 = day1SnapshotView(athlete);
  document.body.dataset.onboardingTemplate = resolved.templateKey;

  // If already completed/locked, skip snapshot page and go hub
  if (athlete?.onboarding?.locks?.step9 === true || athlete?.onboarding?.completedAt) {
    window.location.href = `/athletes/hub?id=${encodeURIComponent(uid)}`;
    return;
  }

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
  const sa = day1.selfAssess || {};

  const parts = [];
  const labels = { honor: "Honor", strong: "Strong", fast: "Fast", smart: resolved.journey === "road2champion" ? "Good Choices" : "Smart", courage: "Courage" };
  for (const [field, label] of Object.entries(labels)) {
    const value = sa[field];
    if (typeof value === "boolean") parts.push(`${label} ${value ? "Yes" : "Not yet"}`);
    else if (Number.isFinite(Number(value))) parts.push(`${label} ${value}/10`);
  }
  setText("sum-scores", parts.length ? parts.join(" · ") : "—");

  // Finisher (boolean)
  if (typeof sa.finisher === "boolean") {
    const finisherNoLabel =
      resolved.journey === "road2champion" ? "Not yet" : "No";

    setText("sum-finisher", sa.finisher ? "Yes" : finisherNoLabel);
  } else {
    setText("sum-finisher", "—");
  }

  // Hero + Legend (Step 8)
  const identity = day1.identity || {};
  const identityKind = resolved.template.identity.kind;
  const identityLabel = $("sum-identity-label");
  const identityValue = identityKind === "mastery"
    ? identity.masteryFocus
    : identityKind === "legend"
      ? identity.futureLegend
      : identity.childhoodHero || identity.futureLegend || identity.masteryFocus;
  if (identityLabel) identityLabel.textContent = resolved.template.identity.heading;
  setText("sum-hero", identityValue || "—");

  // Doctrine: no back. Disable back button.
  if (btnBack) btnBack.disabled = true;

  setStatus("");
}

loadSnapshot().catch((e) => {
  console.error(e);
  setStatus("Error loading snapshot.");
  if (btnComplete) btnComplete.disabled = true;
  if (btnBack) btnBack.disabled = true;
});

// Back → disabled (No Back doctrine)
btnBack?.addEventListener("click", () => {
  // do nothing
});

// Seal → Hub
btnComplete?.addEventListener("click", async () => {
  if (!uid) return;

  // ✅ remember right away (helps Home Screen even if something weird happens later)
  localStorage.setItem("sandman_lastAthleteUid", uid);

  // already completed → go hub
  if (athlete?.onboarding?.locks?.step9 === true || athlete?.onboarding?.completedAt) {
    window.location.href = `/athletes/hub?id=${encodeURIComponent(uid)}`;
    return;
  }

  try {
    btnComplete.disabled = true;
    setStatus("Sealing…");

    await updateDoc(doc(db, "athletes", uid), {
      "onboarding.version": "v1",
      "onboarding.status": "complete",

      // Final step locked
      "onboarding.locks.step9": true,

      // Step 9 completed → next state is 10 (done)
      "onboarding.step": 10,

      "onboarding.day1Snapshot": {
        version: "v1",
        templateKey: resolveOnboardingTemplate(athlete || {}).templateKey,
        relationshipMode: resolveOnboardingTemplate(athlete || {}).relationshipMode,
        journey: resolveOnboardingTemplate(athlete || {}).journey,
        selfAssess: { ...(athlete?.onboarding?.selfAssess || {}) },
        identity: { ...(athlete?.onboarding?.identity || {}) },
        sealedAt: serverTimestamp(),
      },

      "onboarding.completedAt": serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    // ✅ redirect after write + after localStorage is set
    window.location.href = `/athletes/hub?id=${encodeURIComponent(uid)}`;
  } catch (e) {
    console.error(e);
    setStatus("Seal failed. Check console.");
    btnComplete.disabled = false;
  }
});
