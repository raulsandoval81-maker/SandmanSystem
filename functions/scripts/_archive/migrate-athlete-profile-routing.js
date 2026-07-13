const admin = require("firebase-admin");

const DRY_RUN = process.env.DRY_RUN !== "false";

if (!admin.apps.length) {
  admin.initializeApp({
    projectId: "sandmandashboard"
  });
}

const db = admin.firestore();
const DELETE = admin.firestore.FieldValue.delete();

function s(value) {
  return String(value ?? "").trim().toLowerCase();
}

function arr(value) {
  return Array.isArray(value) ? value.map(s) : [];
}

function includesAny(text, parts) {
  return parts.some((part) => text.includes(part));
}

function buildEvidence(id, athlete = {}) {
  return [
    id,
    athlete.uid,
    athlete.uidCode,

    athlete.journey,
    athlete.ladderKey,
    athlete.program,
    athlete.programTrack,

    athlete.track,
    athlete.trackCode,

    athlete.discipline,
    athlete.primaryDiscipline,
    athlete.sport,
    athlete.art,

    athlete.lastAttendanceType,

    athlete.placement?.programTrack,
    athlete.placement?.trackCode,
    athlete.placement?.ladderKey,
    athlete.placement?.art,

    ...arr(athlete.rosterIds),
    ...arr(athlete.placement?.rosterIds)
  ]
    .map(s)
    .join(" ");
}

function canonicalRoute({
  framework,
  journey,
  art,
  ladderKey,
  rosterIds,
  profileType,
  beltSet,
  badgeSet,
  trackCode
}) {
  return {
    framework,

    journey,
    program: journey,
    programTrack: journey,

    track: journey,
    trackCode,

    art,
    sport: art,
    discipline: art,
    primaryDiscipline: art,

    ladderKey,
    rosterIds,

    profileType,
    beltSet,
    badgeSet
  };
}

function inferRouting(id, athlete = {}) {
  const evidence = buildEvidence(id, athlete);
  const upperId = String(id || "").toUpperCase();

  // --------------------------------------------------
  // Strongest explicit routes first
  // --------------------------------------------------

  if (
    includesAny(evidence, [
      "quest2mastery-mma",
      "quest2mastery",
      "quest for mastery",
      "adult-mma"
    ]) ||
    s(athlete.art) === "mma"
  ) {
    return canonicalRoute({
      framework: "foundry4",
      journey: "quest2mastery",
      art: "mma",
      ladderKey: "Q2M",
      rosterIds: ["adult-mma"],
      profileType: "adult",
      beltSet: "adult",
      badgeSet: "adult",
      trackCode: "quest2mastery-mma"
    });
  }

  if (
    includesAny(evidence, [
      "path2legend-boxing",
      "teen-adult-boxing",
      "road2greatness",
      "road to greatness",
      "r2g"
    ]) ||
    s(athlete.art) === "boxing" ||
    s(athlete.sport) === "boxing" ||
    s(athlete.discipline) === "boxing"
  ) {
    return canonicalRoute({
      framework: "foundry4",
      journey: "path2legend",
      art: "boxing",
      ladderKey: "F4",
      rosterIds: ["teen-adult-boxing"],
      profileType: "teen",
      beltSet: "teen",
      badgeSet: "teen",
      trackCode: "path2legend-boxing"
    });
  }

  if (
    includesAny(evidence, [
      "zero2hero-kickboxing",
      "youth-kickboxing"
    ]) ||
    s(athlete.art) === "kickboxing" ||
    s(athlete.sport) === "kickboxing" ||
    s(athlete.discipline) === "kickboxing"
  ) {
    return canonicalRoute({
      framework: "foundry8",
      journey: "zero2hero",
      art: "kickboxing",
      ladderKey: "F8",
      rosterIds: ["youth-kickboxing"],
      profileType: "mini",
      beltSet: "youth",
      badgeSet: "youth",
      trackCode: "zero2hero-kickboxing"
    });
  }

  if (
    includesAny(evidence, [
      "path2legend-wrestling",
      "teen-wrestling",
      "foundry4-wrestling",
      "p2l-wrestling"
    ])
  ) {
    return canonicalRoute({
      framework: "foundry4",
      journey: "path2legend",
      art: "wrestling",
      ladderKey: "F4",
      rosterIds: ["teen-wrestling"],
      profileType: "teen",
      beltSet: "teen",
      badgeSet: "teen",
      trackCode: "path2legend-wrestling"
    });
  }

  if (
    includesAny(evidence, [
      "zero2hero-wrestling",
      "youth-wrestling",
      "foundry8-wrestling",
      "z2h-wrestling"
    ])
  ) {
    return canonicalRoute({
      framework: "foundry8",
      journey: "zero2hero",
      art: "wrestling",
      ladderKey: "F8",
      rosterIds: ["youth-wrestling"],
      profileType: "mini",
      beltSet: "youth",
      badgeSet: "youth",
      trackCode: "zero2hero-wrestling"
    });
  }

  // --------------------------------------------------
  // UID fallback only after art-specific evidence
  // --------------------------------------------------

  if (upperId.startsWith("F8_")) {
    return canonicalRoute({
      framework: "foundry8",
      journey: "zero2hero",
      art: "wrestling",
      ladderKey: "F8",
      rosterIds: ["youth-wrestling"],
      profileType: "mini",
      beltSet: "youth",
      badgeSet: "youth",
      trackCode: "zero2hero-wrestling"
    });
  }

  if (upperId.startsWith("F4_")) {
    return canonicalRoute({
      framework: "foundry4",
      journey: "path2legend",
      art: "wrestling",
      ladderKey: "F4",
      rosterIds: ["teen-wrestling"],
      profileType: "teen",
      beltSet: "teen",
      badgeSet: "teen",
      trackCode: "path2legend-wrestling"
    });
  }

  return null;
}

function sameValue(current, next) {
  if (Array.isArray(next)) {
    return JSON.stringify(current || []) === JSON.stringify(next);
  }

  return current === next;
}

function buildPatch(current = {}, next = {}) {
  const patch = {};

  for (const [key, value] of Object.entries(next)) {
    if (!sameValue(current[key], value)) {
      patch[key] = value;
    }
  }

  // Correct only T0 striking Apprentice entry color.
  const isStriking =
    next.art === "boxing" ||
    next.art === "kickboxing";

  const isT0 =
    s(current.tier) === "t0" ||
    Number(current.tier) === 0;

  const isApprentice =
    s(current.rankName || current.rank) === "apprentice";

  if (
    isStriking &&
    isT0 &&
    isApprentice &&
    s(current.rankColor) !== "gray"
  ) {
    patch.rankColor = "gray";
  }

  // Remove known malformed legacy key.
  if (
    Object.prototype.hasOwnProperty.call(
      current,
      "primaryDiscipline "
    )
  ) {
    patch["primaryDiscipline "] = DELETE;
  }

  return patch;
}

async function main() {
  console.log("\nAthlete routing normalization");
  console.log(`DRY_RUN = ${DRY_RUN}\n`);

  const snapshot = await db.collection("athletes").get();

  let checked = 0;
  let changed = 0;
  let unchanged = 0;
  let skipped = 0;

  const routeCounts = {};
  const ambiguous = [];

  let batch = db.batch();
  let batchCount = 0;

  for (const document of snapshot.docs) {
    checked += 1;

    const id = document.id;
    const athlete = document.data() || {};
    const next = inferRouting(id, athlete);

    if (!next) {
      skipped += 1;
      ambiguous.push({
        id,
        name: athlete.publicName || athlete.fullName || "",
        trackCode: athlete.trackCode || "",
        programTrack: athlete.programTrack || "",
        art: athlete.art || ""
      });

      console.log(
        `SKIP ${id} ${athlete.publicName || athlete.fullName || ""}`
      );

      continue;
    }

    routeCounts[next.trackCode] =
      (routeCounts[next.trackCode] || 0) + 1;

    const patch = buildPatch(athlete, next);

    if (!Object.keys(patch).length) {
      unchanged += 1;
      continue;
    }

    changed += 1;

    console.log(
      `\nUPDATE ${id} ${athlete.publicName || athlete.fullName || ""}`
    );
    console.dir(patch, { depth: null });

    if (!DRY_RUN) {
      batch.update(document.ref, {
        ...patch,
        routingMigratedAt:
          admin.firestore.FieldValue.serverTimestamp(),
        routingMigrationVersion:
          "profile-routing-v2"
      });

      batchCount += 1;

      if (batchCount >= 400) {
        await batch.commit();
        batch = db.batch();
        batchCount = 0;
      }
    }
  }

  if (!DRY_RUN && batchCount > 0) {
    await batch.commit();
  }

  console.log("\nRoute counts:");
  console.table(routeCounts);

  if (ambiguous.length) {
    console.log("\nSkipped records requiring review:");
    console.table(ambiguous);
  }

  console.log("\nDone.");
  console.log(`Checked:   ${checked}`);
  console.log(`Changed:   ${changed}`);
  console.log(`Unchanged: ${unchanged}`);
  console.log(`Skipped:   ${skipped}`);
  console.log(
    DRY_RUN
      ? "No writes made."
      : "Writes completed."
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});