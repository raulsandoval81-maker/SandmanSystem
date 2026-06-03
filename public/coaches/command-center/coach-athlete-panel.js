import {
  db,
  auth, // 👈 ADD THIS
  ensureSignedIn,
  doc,
  updateDoc,
  onSnapshot,
  serverTimestamp
} from "/assets/js/firebase-init.js";
import { getAthleteStripeInfo } from "/assets/js/ladder.service.js";

const $ = (id) => document.getElementById(id);

const params = new URLSearchParams(location.search);
const uid = (params.get("id") || params.get("uid") || "").trim().toUpperCase();

if (!uid) {
  alert("Missing ?id= athlete UID");
  throw new Error("Missing athlete UID");
}

$("athlete-uid").textContent = uid;

const athleteRef = doc(db, "athletes", uid);
let athleteData = null;

const F4_LADDER = {
  T0: { tier: "T0", rankName: "Apprentice", rankColor: "white", xpCap: 1200 },
  T1: { tier: "T1", rankName: "Warrior", rankColor: "blue", xpCap: 1600 },
  T2: { tier: "T2", rankName: "Champion", rankColor: "purple", xpCap: 2000 },
  T3: { tier: "T3", rankName: "Veteran", rankColor: "brown", xpCap: 2400 },
  T4: { tier: "T4", rankName: "Legend", rankColor: "black", xpCap: 2800 },
};

const F8_LADDER = {
  T0: { tier: "T0", rankName: "Shadow", rankColor: "white", xpCap: 800 },
  T1: { tier: "T1", rankName: "Recruit", rankColor: "yellow", xpCap: 1000 },
  T2: { tier: "T2", rankName: "Combatant", rankColor: "orange", xpCap: 1200 },
  T3: { tier: "T3", rankName: "Competitor", rankColor: "green", xpCap: 1400 },
  T4: { tier: "T4", rankName: "Warrior", rankColor: "blue", xpCap: 1600 },
  T5: { tier: "T5", rankName: "Champion", rankColor: "purple", xpCap: 1800 },
  T6: { tier: "T6", rankName: "Veteran", rankColor: "brown", xpCap: 2000 },
  T7: { tier: "T7", rankName: "Hero", rankColor: "black", xpCap: 2400 },
};

function addDays(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d;
}

function formatBool(v) {
  return v ? "YES" : "NO";
}

function setStatus(msg, isError = false) {
  const el = $("status");
  el.textContent = msg;
  el.style.color = isError ? "#ff8a8a" : "#f1c84c";
}

function clearResultFields() {
  return {
    "testing.lastTestResult": null,
    "testing.cooldownUntil": null,
    "testing.freezeUntil": null
  };
}
function toMillis(v) {
  if (!v) return 0;
  if (typeof v?.toDate === "function") return v.toDate().getTime();
  const ms = new Date(v).getTime();
  return Number.isFinite(ms) ? ms : 0;
}

function getJailState(testing = {}) {
  const state = String(testing?.state || "").toUpperCase();
  const now = Date.now();

  const cooldownUntilMs = toMillis(testing?.cooldownUntil);
  const freezeUntilMs = toMillis(testing?.freezeUntil);

  const cooldownActive = state === "COOLDOWN" && cooldownUntilMs > now;
  const freezeActive = state === "FREEZE" && freezeUntilMs > now;

  return {
    state,
    cooldownActive,
    freezeActive,
    jailActive: cooldownActive || freezeActive,
    cooldownUntilMs,
    freezeUntilMs,
  };
}

function assertJailClear(actionLabel) {
  const testing = athleteData?.testing || {};
  const jail = getJailState(testing);

  if (jail.cooldownActive) {
    throw new Error(`${actionLabel} blocked: cooldown still active.`);
  }

  if (jail.freezeActive) {
    throw new Error(`${actionLabel} blocked: freeze still active.`);
  }
}
function inferBase(data) {
  const tb = String(data?.trackBase || "").trim().toUpperCase();
  if (tb === "F4" || tb === "F8") return tb;

  const id = String(data?.uidCode || data?.uid || uid || "").toUpperCase();
  if (id.startsWith("F8_")) return "F8";
  return "F4";
}

function ladderFor(data) {
  return inferBase(data) === "F8" ? F8_LADDER : F4_LADDER;
}

function getCurrentTierMeta(data) {
  const ladder = ladderFor(data);
  return ladder[String(data?.tier || "T0")] || null;
}

function getNextTierMeta(data) {
  const ladder = ladderFor(data);
  const currentTier = String(data?.tier || "T0");
  const match = currentTier.match(/^T(\d+)$/i);
  if (!match) return null;

  const nextTier = `T${Number(match[1]) + 1}`;
  return ladder[nextTier] || null;
}

function toggle(id, show) {
  const el = $(id);
  if (!el) return;
  el.style.display = show ? "block" : "none";
}
function updateButtonVisibility(testing) {
  const jail = getJailState(testing);
  const state = jail.state;

  // Auto stages — system-owned
  toggle("btn-temple", false);
  toggle("btn-eligible", false);

  // Default hidden
  toggle("btn-ready", false);
  toggle("btn-start", false);
  toggle("btn-pass", false);
  toggle("btn-fail", false);
  toggle("btn-retest", false);
  toggle("btn-promote", false);
  toggle("btn-active", false);

  // 🔒 Hard jail — nothing allowed
  if (jail.jailActive) {
    return;
  }

  // Coach-owned stages (only when jail is clear)
  toggle("btn-ready", state === "ELIGIBLE");
  toggle("btn-start", state === "READY");
  toggle("btn-pass", state === "TESTING");
  toggle("btn-fail", state === "TESTING");
  toggle("btn-retest", state === "FREEZE");
  toggle("btn-promote", false);
  toggle("btn-active", state === "FREEZE" || state === "COOLDOWN");
}
function renderAthlete(data) {
  athleteData = data;

  $("athlete-name").textContent = data.publicName || data.fullName || uid;
  $("athlete-tier").textContent = data.tier || "—";
  $("athlete-xp").textContent = `${data.xp ?? 0}`;
const tierName = data.rankName || data.tierName || data.tier;

const stripesTotal = (tierName === "Shadow") ? 3 : 4;
const safeCap = Math.max(1, Number(data.xpCap) || 1);
const safeXp = Math.max(0, Number(data.xp) || 0);

const stripesEarned = Math.max(
  0,
  Math.min(stripesTotal, Math.floor((safeXp / safeCap) * stripesTotal))
);

$("athlete-stripes").textContent = `${stripesEarned}`;
  $("promotion-locked").textContent = formatBool(data.promotionLocked === true);

  const testing = data.testing || {};
  $("testing-state").textContent = testing.state || "ACTIVE";
  $("testing-debug").textContent = JSON.stringify(
    {
      state: testing.state ?? null,
      templeEnteredAt: testing.templeEnteredAt ?? null,
      testEligibleAt: testing.testEligibleAt ?? null,
      coachReady: testing.coachReady ?? false,
      coachReadyAt: testing.coachReadyAt ?? null,
      testingStartedAt: testing.testingStartedAt ?? null,
      lastTestResult: testing.lastTestResult ?? null,
      freezeUntil: testing.freezeUntil ?? null,
      cooldownUntil: testing.cooldownUntil ?? null
    },
    null,
    2
  );

  updateButtonVisibility(testing);
}

async function markReady() {
  await updateDoc(athleteRef, {
    "testing.state": "READY",
    "testing.coachReady": true,
    "testing.coachReadyAt": serverTimestamp(),
    updatedAt: serverTimestamp()
  });

  setStatus("Marked READY.");
}
async function enterTemple() {
  await updateDoc(athleteRef, {
    tierStatus: "temple",

    "testing.state": "TEMPLE",
    "testing.templeEnteredAt": serverTimestamp(),

    "testing.lastTestResult": null,
    "testing.freezeUntil": null,
    "testing.cooldownUntil": null,
    "testing.coachReady": false,
    "testing.coachReadyAt": null,
    "testing.testingStartedAt": null,

    updatedAt: serverTimestamp()
  });
  setStatus("Temple state set.");
}

async function setEligible() {
  await updateDoc(athleteRef, {
    tierStatus: "eligible",

    "testing.state": "ELIGIBLE",
    "testing.testEligibleAt": serverTimestamp(),

    "testing.lastTestResult": null,
    "testing.freezeUntil": null,
    "testing.cooldownUntil": null,
    "testing.coachReady": false,
    "testing.coachReadyAt": null,
    "testing.testingStartedAt": null,

    updatedAt: serverTimestamp()
  });
  setStatus("Eligible state set.");
}

async function startTest() {
  assertJailClear("Start Test");

  await updateDoc(athleteRef, {
    "testing.state": "TESTING",
    "testing.testingStartedAt": serverTimestamp(),
    "testing.lastTestResult": null,
    "testing.freezeUntil": null,
    "testing.cooldownUntil": null,
    updatedAt: serverTimestamp()
  });

  setStatus("Testing started.");
}


async function passTest() {
  assertJailClear("Pass Test");

  if (!athleteData) {
    throw new Error("Athlete not loaded.");
  }

  const currentTier = String(athleteData?.tier || "T0");
  const nextMeta = getNextTierMeta(athleteData);

  if (!nextMeta) {
    throw new Error(`No next tier found from "${athleteData.tier}".`);
  }

  const canReleaseHeldLegacy =
    currentTier === "T0" &&
    nextMeta.tier === "T1" &&
    athleteData?.legacyHold === true &&
    athleteData?.legacyCreditSchedule === "deferred_t1_entry";

  const legacyCreditTotal = Number(athleteData?.legacyCreditTotal || 0);
  const legacyCreditIssued = Number(athleteData?.legacyCreditIssued || 0);

  const heldRelease = canReleaseHeldLegacy
    ? Math.max(0, legacyCreditTotal - legacyCreditIssued)
    : 0;

    const previousBadge = {
  tier: currentTier,
  rankName: athleteData.rankName || "",
  rankColor: athleteData.rankColor || "",
  earnedAt: new Date().toISOString()
};
 
  const updatePayload = {
    // PROMOTION HAPPENS NOW
    tier: nextMeta.tier,
    rankName: nextMeta.rankName,
    rankColor: nextMeta.rankColor,
    xpCap: nextMeta.xpCap,

    xp: heldRelease,
    stripeCount: 0,

    // ACTIVE GRATITUDE WINDOW
    tierStatus: "cooldown",
    promotionLocked: false,

    "testing.state": "COOLDOWN",
    "testing.lastTestResult": "pass",
    "testing.cooldownUntil": addDays(5),
    "testing.freezeUntil": null,
    "testing.testingStartedAt": null,
    "testing.coachReady": false,
    "testing.coachReadyAt": null,

    "testing.promotedFrom": currentTier,
    "testing.promotedTo": nextMeta.tier,
    "testing.promotedAt": serverTimestamp(),

      // 🔥 ADD THIS BLOCK
  badges: [
    ...(Array.isArray(athleteData.badges) ? athleteData.badges : []),
    previousBadge
  ],

    updatedAt: serverTimestamp()
  };

  if (canReleaseHeldLegacy) {
    updatePayload.legacyCreditIssued = legacyCreditIssued + heldRelease;
    updatePayload.legacyHold = false;
  }

  await updateDoc(athleteRef, updatePayload);

  if (canReleaseHeldLegacy) {
    setStatus(`Pass recorded. Advanced to ${nextMeta.tier}. Cooldown applied. Released held legacy XP: +${heldRelease}.`);
  } else {
    setStatus(`Pass recorded. Advanced to ${nextMeta.tier}. Cooldown applied.`);
  }
}

async function failTest() {
   assertJailClear("Fail Test"); // ADD
  await updateDoc(athleteRef, {
    tierStatus: "freeze",

    "testing.state": "FREEZE",
    "testing.lastTestResult": "fail",
    "testing.freezeUntil": addDays(7),
    "testing.cooldownUntil": null,
    "testing.testingStartedAt": null,
    "testing.coachReady": false,
    "testing.coachReadyAt": null,

    updatedAt: serverTimestamp()
  });
  setStatus("Fail recorded. Freeze applied.");
}

async function retestAthlete() {
  assertJailClear("Retest"); // ADD
  await updateDoc(athleteRef, {
    tierStatus: "eligible",

    "testing.state": "ELIGIBLE",
    "testing.lastTestResult": null,
    "testing.freezeUntil": null,
    "testing.cooldownUntil": null,
    "testing.coachReady": false,
    "testing.coachReadyAt": null,
    "testing.testingStartedAt": null,

    updatedAt: serverTimestamp()
  });
  setStatus("Retest ready.");
}

async function returnActive() {
  await updateDoc(athleteRef, {
    tierStatus: "active",

    "testing.state": "ACTIVE",
    "testing.coachReady": false,
    "testing.coachReadyAt": null,
    "testing.testingStartedAt": null,
    ...clearResultFields(),

    updatedAt: serverTimestamp()
  });
  setStatus("Returned to ACTIVE (same tier).");
}


async function promoteAthlete() {
  assertJailClear("Promote");
  if (!athleteData) {
    throw new Error("Athlete not loaded.");
  }

  const currentTier = String(athleteData?.tier || "T0");
  const nextMeta = getNextTierMeta(athleteData);
  if (!nextMeta) {
    throw new Error(`No next tier found from "${athleteData.tier}".`);
  }

  const canReleaseHeldLegacy =
    currentTier === "T0" &&
    nextMeta.tier === "T1" &&
    athleteData?.legacyHold === true &&
    athleteData?.legacyCreditSchedule === "deferred_t1_entry";

  const legacyCreditTotal = Number(athleteData?.legacyCreditTotal || 0);
  const legacyCreditIssued = Number(athleteData?.legacyCreditIssued || 0);

  const heldRelease = canReleaseHeldLegacy
    ? Math.max(0, legacyCreditTotal - legacyCreditIssued)
    : 0;

  const updatePayload = {
    tier: nextMeta.tier,
    rankName: nextMeta.rankName,
    rankColor: nextMeta.rankColor,
    xpCap: nextMeta.xpCap,

    xp: heldRelease,
    stripeCount: 0,
    tierStatus: "active",
    promotionLocked: false,

    "testing.state": "ACTIVE",
    "testing.coachReady": false,
    "testing.coachReadyAt": null,
    "testing.testingStartedAt": null,
    "testing.lastTestResult": null,
    "testing.cooldownUntil": null,
    "testing.freezeUntil": null,
    "testing.templeEnteredAt": null,
    "testing.testEligibleAt": null,

    updatedAt: serverTimestamp()
  };

  if (canReleaseHeldLegacy) {
    updatePayload.legacyCreditIssued = legacyCreditIssued + heldRelease;
    updatePayload.legacyHold = false;
  }

  await updateDoc(athleteRef, updatePayload);

  if (canReleaseHeldLegacy) {
    setStatus(`Promoted to ${nextMeta.tier}. Released held legacy XP: +${heldRelease}.`);
  } else {
    setStatus(`Promoted to ${nextMeta.tier}. Fresh start.`);
  }
}
async function bind() {
  try {
    await ensureSignedIn();

    // 👇 ADD THIS
    console.log("SIGNED IN USER:", auth.currentUser?.uid);

  } catch (err) {
    console.error(err);
    setStatus("Sign-in failed.", true);
    return;
  }

  onSnapshot(
    athleteRef,
    (snap) => {
      if (!snap.exists()) {
        setStatus("Athlete not found.", true);
        return;
      }
      renderAthlete(snap.data() || {});
    },
    (err) => {
      console.error(err);
      setStatus("Live load failed.", true);
    }
  );

  $("btn-temple")?.addEventListener("click", async () => {
    try {
      await enterTemple();
    } catch (err) {
      console.error(err);
      setStatus("Enter Temple failed.", true);
    }
  });

  $("btn-eligible")?.addEventListener("click", async () => {
    try {
      await setEligible();
    } catch (err) {
      console.error(err);
      setStatus("Set Eligible failed.", true);
    }
  });

  $("btn-ready")?.addEventListener("click", async () => {
    try {
      await markReady();
    } catch (err) {
      console.error(err);
      setStatus("Mark Ready failed.", true);
    }
  });

  $("btn-start")?.addEventListener("click", async () => {
    try {
      await startTest();
    } catch (err) {
      console.error(err);
      setStatus("Start Test failed.", true);
    }
  });

  $("btn-pass")?.addEventListener("click", async () => {
    try {
      await passTest();
    } catch (err) {
      console.error(err);
      setStatus("Pass failed.", true);
    }
  });

  $("btn-fail")?.addEventListener("click", async () => {
    try {
      await failTest();
    } catch (err) {
      console.error(err);
      setStatus("Fail failed.", true);
    }
  });

  $("btn-retest")?.addEventListener("click", async () => {
    try {
      await retestAthlete();
    } catch (err) {
      console.error(err);
      setStatus("Retest failed.", true);
    }
  });

  $("btn-promote")?.addEventListener("click", async () => {
    try {
      await promoteAthlete();
    } catch (err) {
      console.error(err);
      setStatus(err.message || "Promote failed.", true);
    }
  });

  $("btn-active")?.addEventListener("click", async () => {
    try {
      await returnActive();
    } catch (err) {
      console.error(err);
      setStatus("Return Active failed.", true);
    }
  });
}

bind();