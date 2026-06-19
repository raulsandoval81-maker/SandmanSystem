import {
  onCall,
  HttpsError,
} from "firebase-functions/v2/https";

import {
  getFirestore,
} from "firebase-admin/firestore";

import {
  createParentSignal,
  PARENT_SIGNAL_TYPES,
} from "./createParentSignal";

const ALLOWED_TYPES = new Set([
  "TOURNAMENT_ADDED",
  "WEIGH_IN_REMINDER",
  "TOURNAMENT_TOMORROW",
  "BRACKET_POSTED",
  "RESULT_POSTED",
]);

function mapTournamentSignalType(type: string) {
  if (type === "TOURNAMENT_ADDED") return PARENT_SIGNAL_TYPES.TOURNAMENT_POSTED;
  if (type === "TOURNAMENT_TOMORROW") return PARENT_SIGNAL_TYPES.TOURNAMENT_REMINDER;
  if (type === "RESULT_POSTED") return PARENT_SIGNAL_TYPES.TOURNAMENT_RESULTS_POSTED;
  if (type === "BRACKET_POSTED") return PARENT_SIGNAL_TYPES.TOURNAMENT_UPDATED;
  if (type === "WEIGH_IN_REMINDER") return PARENT_SIGNAL_TYPES.TOURNAMENT_REMINDER;

  return PARENT_SIGNAL_TYPES.TOURNAMENT_UPDATED;
}

export const sendTournamentPing = onCall(async (req) => {
  if (!req.auth) {
    throw new HttpsError(
      "unauthenticated",
      "Coach authentication required."
    );
  }

  const db = getFirestore();

  const type = String(req.data?.type || "").trim();
  const athleteId = String(req.data?.athleteId || "").trim().toUpperCase();
  const tournamentId = String(req.data?.tournamentId || "").trim();
  const eventName = String(req.data?.eventName || "").trim();

  if (!ALLOWED_TYPES.has(type)) {
    throw new HttpsError(
      "invalid-argument",
      "Invalid tournament ping type."
    );
  }

  if (!athleteId) {
    throw new HttpsError(
      "invalid-argument",
      "Missing athleteId."
    );
  }

  if (!eventName) {
    throw new HttpsError(
      "invalid-argument",
      "Missing eventName."
    );
  }

  const athleteSnap =
    await db.collection("athletes").doc(athleteId).get();

  if (!athleteSnap.exists) {
    throw new HttpsError(
      "not-found",
      "Athlete not found."
    );
  }

  const athlete = athleteSnap.data() || {};

  const athleteName = String(
    athlete.publicName ||
    athlete.fullName ||
    athleteId
  );

  const signalType =
    mapTournamentSignalType(type);

  const result =
    await createParentSignal({
      athleteId,
      athleteName,
      type: signalType,
      source: "tournament",
      sourceId: tournamentId || eventName,
      tournamentId: tournamentId || undefined,
      tournamentTitle: eventName,
      note: eventName,
      meta: {
        tournamentId: tournamentId || null,
        eventName,
        originalType: type,
      },
    });

  return {
    ok: result.ok,
    sent: result.sent || 0,
    athleteId,
    type,
    signalType,
    eventName,
    tournamentId: tournamentId || null,
    reason: result.reason || null,
  };
});