const admin = require("firebase-admin");

const DRY_RUN = process.env.DRY_RUN !== "false";

admin.initializeApp({
  projectId: "sandmandashboard"
});

const db = admin.firestore();
const DELETE = admin.firestore.FieldValue.delete();

function s(v) {
  return String(v || "").trim().toLowerCase();
}

function includesAny(text, parts) {
  return parts.some((p) => text.includes(p));
}

function inferRouting(id, a = {}) {
  const blob = [
    id,
    a.uid,
    a.uidCode,
    a.journey,
    a.ladderKey,
    a.program,
    a.programTrack,
    a.track,
    a.trackCode,
    a.discipline,
    a.primaryDiscipline,
    a.sport,
    a.art,
    a.placement?.programTrack,
    a.placement?.trackCode,
    a.placement?.ladderKey,
    a.placement?.art
  ].map(s).join(" ");

  if (
    id.startsWith("F8_") ||
    includesAny(blob, ["z2h", "zero2hero", "foundry8"])
  ) {
    return {
      profileType: "mini",
      beltSet: "youth",
      badgeSet: "youth",
      journey: "z2h",
      ladderKey: "Z2H",
      discipline: "wrestling",
      primaryDiscipline: "wrestling",
      sport: "wrestling",
      art: "wrestling",
      program: "zero2hero",
      programTrack: "zero2hero",
      track: "foundry8-combat",
      trackCode: "foundry8-combat",
      rosterIds: ["foundry8-wrestling"]
    };
  }

  if (
    includesAny(blob, ["q2m", "quest2mastery", "quest for mastery", "mma"])
  ) {
    return {
      profileType: "adult",
      beltSet: "adult",
      badgeSet: "adult",
      journey: "q2m",
      ladderKey: "Q2M",
      discipline: "mma",
      primaryDiscipline: "mma",
      sport: "mma",
      art: "mma",
      program: "quest2mastery",
      programTrack: "quest2mastery",
      track: "quest2mastery-mma",
      trackCode: "quest2mastery-mma",
      rosterIds: ["quest2mastery-mma"]
    };
  }

  if (
    includesAny(blob, ["r2g", "road2greatness", "road to greatness", "boxing"])
  ) {
    return {
      profileType: "adult",
      beltSet: "adult",
      badgeSet: "adult",
      journey: "r2g",
      ladderKey: "R2G",
      discipline: "boxing",
      primaryDiscipline: "boxing",
      sport: "boxing",
      art: "boxing",
      program: "road2greatness",
      programTrack: "road2greatness",
      track: "road2greatness-boxing",
      trackCode: "road2greatness-boxing",
      rosterIds: ["road2greatness-boxing"]
    };
  }

  if (
    id.startsWith("F4_") ||
    includesAny(blob, ["p2l", "path2legend", "foundry4"])
  ) {
    return {
      profileType: "teen",
      beltSet: "teen",
      badgeSet: "teen",
      journey: "p2l",
      ladderKey: "P2L",
      discipline: "wrestling",
      primaryDiscipline: "wrestling",
      sport: "wrestling",
      art: "wrestling",
      program: "path2legend",
      programTrack: "path2legend",
      track: "foundry4-combat",
      trackCode: "foundry4-combat",
      rosterIds: ["foundry4-wrestling"]
    };
  }

  return null;
}

function diff(current = {}, next = {}) {
  const out = {};

  for (const [key, value] of Object.entries(next)) {
    const oldVal = current[key];
    const same =
      Array.isArray(value)
        ? JSON.stringify(oldVal || []) === JSON.stringify(value)
        : oldVal === value;

    if (!same) out[key] = value;
  }

  if (Object.prototype.hasOwnProperty.call(current, "primaryDiscipline ")) {
    out["primaryDiscipline "] = DELETE;
  }

  return out;
}

async function main() {
  console.log(`\nAthlete profile routing migration`);
  console.log(`DRY_RUN = ${DRY_RUN}\n`);

  const snap = await db.collection("athletes").get();

  let checked = 0;
  let changed = 0;
  let skipped = 0;

  let batch = db.batch();
  let batchCount = 0;

  for (const docSnap of snap.docs) {
    checked += 1;

    const id = docSnap.id;
    const data = docSnap.data() || {};
    const next = inferRouting(id, data);

    if (!next) {
      skipped += 1;
      console.log(`SKIP ${id} ${data.publicName || data.fullName || ""}`);
      continue;
    }

    const patch = diff(data, next);

    if (!Object.keys(patch).length) continue;

    changed += 1;

    console.log(`\nUPDATE ${id} ${data.publicName || data.fullName || ""}`);
    console.log(patch);

    if (!DRY_RUN) {
      batch.update(docSnap.ref, {
        ...patch,
        routingMigratedAt: admin.firestore.FieldValue.serverTimestamp(),
        routingMigrationVersion: "profile-routing-v1"
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

  console.log(`\nDone.`);
  console.log(`Checked: ${checked}`);
  console.log(`Changed: ${changed}`);
  console.log(`Skipped: ${skipped}`);
  console.log(DRY_RUN ? `No writes made.` : `Writes completed.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
