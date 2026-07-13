const admin = require("firebase-admin");

if (!admin.apps.length) {
  admin.initializeApp({
    projectId: "sandmandashboard",
  });
}

const db = admin.firestore();
const FieldValue = admin.firestore.FieldValue;

const CANONICAL_UID = "F4_0001";
const DUPLICATE_UID = "F4_0064";
const APPLY = process.argv.includes("--apply");

function clean(value = "") {
  return String(value || "").trim().toLowerCase();
}

function unique(values = []) {
  return [...new Set(values.filter(Boolean))];
}

function combatRecord(data = {}, fallbackDiscipline) {
  const discipline =
    clean(
      data.primaryDiscipline ||
      data.discipline ||
      data.art ||
      fallbackDiscipline
    ) || fallbackDiscipline;

  return {
    discipline,
    primaryDiscipline: discipline,
    sport: discipline,
    art: discipline,

    framework: data.framework || "foundry4",
    journey: data.journey || "path2legend",
    program: data.program || data.programTrack || "path2legend",
    programTrack: data.programTrack || "path2legend",
    track: data.track || "path2legend",
    trackCode:
      data.trackCode ||
      `path2legend-${discipline}`,
    ladderKey: data.ladderKey || "F4",

    rosterIds: Array.isArray(data.rosterIds)
      ? data.rosterIds
      : [],

    coachIds: Array.isArray(data.coachIds)
      ? data.coachIds
      : [],

    locationId: data.locationId || null,
    placement: data.placement || null,

    tier: data.tier || "T0",
    rank: data.rank || null,
    rankName:
      data.rankName ||
      (discipline === "wrestling"
        ? "Warrior"
        : "Apprentice"),

    rankColor:
      data.rankColor ||
      (discipline === "wrestling"
        ? "blue"
        : "gray"),

    xp: Number(data.xp || 0),

    xpCap:
      Number(
        data.xpCap ||
        (data.tier === "T1" ? 1600 : 1000)
      ),

    stripeCount:
      Number(data.stripeCount || 0),

    testing: data.testing || {
      state: "ACTIVE",
      coachReady: false,
      coachReadyAt: null,
      testingStartedAt: null,
      cooldownUntil: null,
      freezeUntil: null,
      lastTestResult: null,
      templeEnteredAt: null,
      testEligibleAt: null,
    },

    profileType: data.profileType || "teen",
    beltSet: data.beltSet || "teen",
    badgeSet: data.badgeSet || "teen",

    migratedFromUid: data.uid || null,
  };
}

async function main() {
  const canonicalRef =
    db.doc(`athletes/${CANONICAL_UID}`);

  const duplicateRef =
    db.doc(`athletes/${DUPLICATE_UID}`);

  const [canonicalSnap, duplicateSnap] =
    await Promise.all([
      canonicalRef.get(),
      duplicateRef.get(),
    ]);

  if (!canonicalSnap.exists) {
    throw new Error(
      `Canonical athlete missing: ${CANONICAL_UID}`
    );
  }

  if (!duplicateSnap.exists) {
    throw new Error(
      `Duplicate athlete missing: ${DUPLICATE_UID}`
    );
  }

  const canonical =
    canonicalSnap.data() || {};

  const duplicate =
    duplicateSnap.data() || {};

  // Strong safety checks.
  if (
    clean(canonical.trackCode) !==
    "path2legend-wrestling"
  ) {
    throw new Error(
      `${CANONICAL_UID} is not the expected wrestling athlete.`
    );
  }

  if (
    clean(duplicate.trackCode) !==
    "path2legend-boxing"
  ) {
    throw new Error(
      `${DUPLICATE_UID} is not the expected boxing athlete.`
    );
  }

  if (
    clean(duplicate.mergedInto) ===
    clean(CANONICAL_UID)
  ) {
    console.log("✓ Max is already merged.");
    return;
  }

  const wrestling =
    combatRecord(
      {
        ...canonical,
        uid: CANONICAL_UID,
      },
      "wrestling"
    );

  const boxing =
    combatRecord(
      {
        ...duplicate,
        uid: DUPLICATE_UID,
      },
      "boxing"
    );

  const mergedRosterIds =
    unique([
      ...(canonical.rosterIds || []),
      ...(duplicate.rosterIds || []),
    ]);

  const mergedCoachIds =
    unique([
      ...(canonical.coachIds || []),
      ...(duplicate.coachIds || []),
    ]);

  const duplicateLinksSnap =
    await db
      .collection("parentAthleteLinks")
      .where(
        "athleteUid",
        "==",
        DUPLICATE_UID
      )
      .get();

  console.log("\nMAX MERGE PREVIEW");
  console.log("-----------------");
  console.log(
    `Canonical: ${CANONICAL_UID}`
  );
  console.log(
    `Wrestling: ${wrestling.rankName}, ${wrestling.xp}/${wrestling.xpCap} XP`
  );
  console.log(
    `Boxing: ${boxing.rankName}, ${boxing.xp}/${boxing.xpCap} XP`
  );
  console.log(
    `Duplicate parent links to deactivate: ${duplicateLinksSnap.size}`
  );
  console.log(
    `Merged rosters: ${mergedRosterIds.join(", ")}`
  );

  if (!APPLY) {
    console.log("\nDRY RUN ONLY — no writes made.");
    console.log(
      "Run again with --apply after reviewing this output:"
    );
    console.log(
      "node scripts/repair-max-merge.js --apply"
    );
    return;
  }

  const now =
    FieldValue.serverTimestamp();

  const backupId =
    `max_merge_${Date.now()}`;

  const backupCanonicalRef =
    db.doc(
      `maintenance_backups/${backupId}_F4_0001`
    );

  const backupDuplicateRef =
    db.doc(
      `maintenance_backups/${backupId}_F4_0064`
    );

  const receiptRef =
    db.collection("maintenance_receipts").doc();

  const batch = db.batch();

  // Full backups before changing either athlete.
  batch.set(backupCanonicalRef, {
    type: "ATHLETE_PRE_MERGE_BACKUP",
    athleteUid: CANONICAL_UID,
    mergeTarget: CANONICAL_UID,
    sourceData: canonical,
    createdAt: now,
  });

  batch.set(backupDuplicateRef, {
    type: "ATHLETE_PRE_MERGE_BACKUP",
    athleteUid: DUPLICATE_UID,
    mergeTarget: CANONICAL_UID,
    sourceData: duplicate,
    createdAt: now,
  });

  // Preserve root wrestling fields for legacy engines,
  // while establishing the new nested model.
  batch.update(canonicalRef, {
    activeDiscipline: "wrestling",

    disciplineIds: [
      "wrestling",
      "boxing",
    ],

    "disciplines.wrestling": {
      ...wrestling,
      createdAt:
        canonical.createdAt || now,
      updatedAt: now,
    },

    "disciplines.boxing": {
      ...boxing,
      createdAt:
        duplicate.createdAt || now,
      updatedAt: now,
    },

    rosterIds: mergedRosterIds,
    coachIds: mergedCoachIds,

    multiDiscipline: true,
    isCanonical: true,

    mergedAthleteUids:
      FieldValue.arrayUnion(
        DUPLICATE_UID
      ),

    updatedAt: now,
  });

  // Keep the duplicate as a redirect/audit record.
  batch.update(duplicateRef, {
    active: false,
    isCanonical: false,
    status: "merged",

    mergedInto: CANONICAL_UID,
    canonicalAthleteUid:
      CANONICAL_UID,

    mergedAt: now,
    updatedAt: now,
  });

  // Do not redirect these duplicate documents in place.
  // Deactivate them so canonical links remain authoritative.
  duplicateLinksSnap.forEach((snap) => {
    batch.update(snap.ref, {
      status: "inactive",
      mergedIntoAthleteUid:
        CANONICAL_UID,
      mergeReason:
        "duplicate_athlete_identity",
      updatedAt: now,
    });
  });

  batch.set(receiptRef, {
    type: "ATHLETE_IDENTITY_MERGED",

    canonicalAthleteUid:
      CANONICAL_UID,

    duplicateAthleteUid:
      DUPLICATE_UID,

    disciplines: [
      "wrestling",
      "boxing",
    ],

    activeDiscipline:
      "wrestling",

    duplicateParentLinksDeactivated:
      duplicateLinksSnap.size,

    backupIds: [
      backupCanonicalRef.id,
      backupDuplicateRef.id,
    ],

    createdAt: now,
  });

  await batch.commit();

  console.log("\n✓ MAX MERGE COMPLETE");
  console.log(
    `✓ Canonical identity: ${CANONICAL_UID}`
  );
  console.log(
    "✓ Wrestling copied to disciplines.wrestling"
  );
  console.log(
    "✓ Boxing copied to disciplines.boxing"
  );
  console.log(
    `✓ ${DUPLICATE_UID} marked merged/inactive`
  );
  console.log(
    `✓ ${duplicateLinksSnap.size} duplicate parent links deactivated`
  );
  console.log(
    `✓ Backup prefix: ${backupId}`
  );
  console.log(
    `✓ Receipt: ${receiptRef.id}`
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("\n✗ MERGE FAILED");
    console.error(err);
    process.exit(1);
  });
