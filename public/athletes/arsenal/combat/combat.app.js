import {
  db,
  ensureSignedIn,
  doc,
  getDoc
} from "/assets/js/firebase-init.js";

console.log("Combat lane loaded");

const params = new URLSearchParams(window.location.search);
const athleteId = (params.get("id") || "").trim().toUpperCase();

console.log("Athlete ID:", athleteId);

function wire(id, url) {
  const el = document.getElementById(id);

  if (!el) {
    console.warn("Missing element:", id);
    return;
  }

  const link = `${url}?id=${encodeURIComponent(athleteId)}`;
  el.href = link;

  console.log("Linked:", id, "→", link);
}

function unlockCard(cardId, trainId, studyId, toolUrl, syllabusUrl) {
  const card = document.getElementById(cardId);
  if (card) card.classList.remove("locked");

  wire(trainId, toolUrl);
  wire(studyId, syllabusUrl);
}

async function loadCombatUnlocks() {
  if (!athleteId) {
    console.error("Missing athlete ID");
    return;
  }

  await ensureSignedIn();

  const athleteRef = doc(db, "athletes", athleteId);
  const athleteSnap = await getDoc(athleteRef);

  if (!athleteSnap.exists()) {
    console.error("Athlete not found:", athleteId);
    return;
  }

  const athlete = athleteSnap.data() || {};

  console.log("Combat athlete full doc:", athlete);
  console.log("Combat stripe fields:", {
    stripeCount: athlete.stripeCount,
    stripesEarned: athlete.stripesEarned,
    stripes: athlete.stripes
  });
  console.log("Combat tier fields:", {
    tier: athlete.tier,
    tierIndex: athlete.tierIndex
  });

  const stripe = Number(
    athlete.stripeCount ??
    athlete.stripesEarned ??
    athlete.stripes ??
    0
  );

  const tier = Number(
    athlete.tier ??
    athlete.tierIndex ??
    0
  );

  console.log("Stripe value used:", stripe);
  console.log("Tier value used:", tier);

  // F8 starts at V0
  if (athleteId.startsWith("F8")) {
    unlockCard(
      "card-v0",
      "v0-train",
      "v0-study",
      "/athletes/arsenal/combat/shadowtrainer-v0-tool.html",
      "/athletes/arsenal/combat/shadowtrainer-v0-syllabus.html"
    );
  }

  // F4 compressed entry starts at V2
  if (athleteId.startsWith("F4") && (stripe >= 2 || tier >= 1)) {
    unlockCard(
      "card-v2",
      "v2-train",
      "v2-study",
      "/athletes/arsenal/combat/shadowtrainer-v2-tool.html",
      "/athletes/arsenal/combat/shadowtrainer-v2-syllabus.html"
    );
  }
}

await loadCombatUnlocks();