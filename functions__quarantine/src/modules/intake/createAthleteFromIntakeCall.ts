import { onCall, HttpsError } from "firebase-functions/v2/https";
import { admin, db } from "../../infra/admin";
import { requireCoachOrAdminV2 } from "../../infra/authzV2";

function pad4(n: number) { return String(n).padStart(4, "0"); }
function pad6(n: number) { return String(n).padStart(6, "0"); }

function buildMintTag(track: string, lane: string, seq4: string, virtue: string) {
  return `${track}_${lane}${seq4}_${virtue}`;
}

export const createAthleteFromIntakeCall = onCall(async (req) => {
  requireCoachOrAdminV2(req);

  const { intakeId, mint, publicName, team, virtue } = req.data || {};
  if (!intakeId) throw new HttpsError("invalid-argument", "Missing intakeId");
  if (!mint?.uid || !mint?.lane) throw new HttpsError("invalid-argument", "Missing mint.uid or mint.lane");
  if (!publicName?.initial || !publicName?.last) throw new HttpsError("invalid-argument", "Missing publicName.initial/last");
  if (!team?.name) throw new HttpsError("invalid-argument", "Missing team.name");
  if (!virtue) throw new HttpsError("invalid-argument", "Missing virtue");

  const uid: string = String(mint.uid).trim();
  const lane: string = String(mint.lane).trim(); // "CB"
  const track: string = uid.startsWith("F8-") ? "F8" : uid.startsWith("F4-") ? "F4" : "";
  if (!track) throw new HttpsError("invalid-argument", "UID must start with F8- or F4-");

  // Enforce your rule: F8 = Combat only
  if (track === "F8" && lane !== "CB") {
    throw new HttpsError("failed-precondition", "Foundry 8 is Combat-only at launch.");
  }

  const intakeRef = db.collection("intakes").doc(String(intakeId).trim());
  const athleteRef = db.collection("athletes").doc(uid);

  const mintCounterRef = db.collection("meta").doc("mintCounters").collection("byScope").doc(`${track}_${lane}`);
  const padlockCounterRef = db.collection("meta").doc("padlockCounters").collection("byScope").doc("global");

  const result = await db.runTransaction(async (tx) => {
    const intakeSnap = await tx.get(intakeRef);
    if (!intakeSnap.exists) throw new HttpsError("not-found", "Intake not found.");

    const intake = intakeSnap.data() as any;

    if (intake.status !== "approved" || !intake.approvedUid) {
      throw new HttpsError("failed-precondition", "Intake must be approved first.");
    }

    // If athlete already exists, return it (idempotent)
    const aSnap = await tx.get(athleteRef);
    if (aSnap.exists) {
      return { ok: true, athlete: aSnap.data(), alreadyExisted: true };
    }

    // MintTag counter
    const mintCounterSnap = await tx.get(mintCounterRef);
    const mintCurrent = (mintCounterSnap.exists ? (mintCounterSnap.data() as any).current : 0) as number;
    const mintNext = mintCurrent + 1;

    tx.set(mintCounterRef, {
      current: mintNext,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });

    const mintSeq4 = pad4(mintNext);
    const mintTag = buildMintTag(track, lane, mintSeq4, String(virtue).trim().toUpperCase());

    // Padlock counter
    const padSnap = await tx.get(padlockCounterRef);
    const padCurrent = (padSnap.exists ? (padSnap.data() as any).current : 0) as number;
    const letter = (padSnap.exists ? (padSnap.data() as any).letter : "A") as string;
    const padNext = padCurrent + 1;

    tx.set(padlockCounterRef, {
      current: padNext,
      letter,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });

    const padlock = `${letter}${pad6(padNext)}`;

    const tier = "T0";
    const rank = track === "F8" ? "Shadow" : "Apprentice";

    const first = intake.first ?? intake.athlete?.first ?? "";
    const last = intake.last ?? intake.athlete?.last ?? "";
    const dob = intake.dob ?? intake.athlete?.dob ?? null;

    const athlete = {
      uid, track, lane, tier, rank,

      xp: 0,
      xpStrength: 0,
      xpHonor: 0,

      fullName: `${first} ${last}`.trim(),
      dob,

      publicName: `${publicName.initial} ${publicName.last}`.trim(),
      publicInitial: String(publicName.initial).trim(),
      publicLast: String(publicName.last).trim(),

      team: String(team.name).trim(),
      city: String(team.city || "").trim(),
      state: String(team.state || "").trim(),

      mintVirtueTag: mintTag,
      mintVirtueTagDisplay: mintTag,
      mintSeq: mintNext,

      padlock,
      padlockSeq: padNext,

      intakeTokenId: intakeSnap.id,

      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    tx.set(athleteRef, athlete, { merge: false });

    // mark intake as “activated” (separate from approved)
    tx.set(intakeRef, {
      activatedUid: uid,
      activatedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });

    return { ok: true, athlete };
  });

  return result;
});
