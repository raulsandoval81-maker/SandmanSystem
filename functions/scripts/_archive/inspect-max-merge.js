const admin = require("firebase-admin");

if (!admin.apps.length) {
  admin.initializeApp({
    projectId: "sandmandashboard",
  });
}

const db = admin.firestore();

const CANONICAL_UID = "F4_0001";
const DUPLICATE_UID = "F4_0064";

function summarize(uid, data = {}) {
  return {
    uid,

    identity: {
      fullName: data.fullName,
      publicName: data.publicName,
      parentUid: data.parentUid,
      parentEmail: data.parentEmail,
      parentLinked: data.parentLinked,
      parentStatus: data.parentStatus,
    },

    combat: {
      framework: data.framework,
      journey: data.journey,
      programTrack: data.programTrack,
      track: data.track,
      trackCode: data.trackCode,
      art: data.art,
      discipline: data.discipline,
      primaryDiscipline: data.primaryDiscipline,
      ladderKey: data.ladderKey,

      tier: data.tier,
      rank: data.rank,
      rankName: data.rankName,
      rankColor: data.rankColor,
      xp: data.xp,
      xpCap: data.xpCap,
      stripeCount: data.stripeCount,
      testing: data.testing,
    },

    shared: {
      strengthXp: data.strengthXp,
      honorXp: data.honorXp,
      strength: data.strength,
      honor: data.honor,
      medical: data.medical,
      waiver: data.waiver,
    },

    routing: {
      rosterIds: data.rosterIds,
      coachIds: data.coachIds,
      locationId: data.locationId,
      profileType: data.profileType,
      beltSet: data.beltSet,
      badgeSet: data.badgeSet,
    },

    existingMultiDiscipline: {
      activeDiscipline: data.activeDiscipline,
      disciplineIds: data.disciplineIds,
      disciplines: data.disciplines,
    },

    status: {
      status: data.status,
      active: data.active,
      isCanonical: data.isCanonical,
      mergedInto: data.mergedInto,
    },
  };
}

async function main() {
  const [canonicalSnap, duplicateSnap] =
    await Promise.all([
      db.doc(`athletes/${CANONICAL_UID}`).get(),
      db.doc(`athletes/${DUPLICATE_UID}`).get(),
    ]);

  if (!canonicalSnap.exists) {
    throw new Error(`Missing canonical athlete: ${CANONICAL_UID}`);
  }

  if (!duplicateSnap.exists) {
    throw new Error(`Missing duplicate athlete: ${DUPLICATE_UID}`);
  }

  console.dir(
    {
      canonical: summarize(
        CANONICAL_UID,
        canonicalSnap.data()
      ),

      duplicate: summarize(
        DUPLICATE_UID,
        duplicateSnap.data()
      ),
    },
    {
      depth: null,
      colors: true,
    }
  );

  const parentLinks = await db
    .collection("parentAthleteLinks")
    .where(
      "athleteUid",
      "in",
      [CANONICAL_UID, DUPLICATE_UID]
    )
    .get();

  console.log("\nPARENT LINKS");

  parentLinks.forEach((snap) => {
    console.log(snap.id, snap.data());
  });
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
