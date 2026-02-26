// functions/src/modules/notes/addCoachNoteCore.ts
import * as admin from "firebase-admin";

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

export type CoachNoteType =
  | "athlete"
  | "parent"
  | "injury"
  | "coachPrivate"
  | "conduct"
  | "goal"
  | "eventSummary";

export interface AddCoachNoteReq {
  athleteUid: string;
  type: CoachNoteType;
  body: string;
  title?: string | null;
  linkedXp?: string | null;
  linkedEventId?: string | null;
  meta?: any;
  actorUid?: string | null;
}

function defaultVisibility(type: CoachNoteType) {
  switch (type) {
    case "injury":
      return { coach: true, parent: true, athlete: false };
    case "parent":
      return { coach: true, parent: true, athlete: false };
    case "coachPrivate":
      return { coach: true, parent: false, athlete: false };
    case "athlete":
    case "goal":
      return { coach: true, parent: false, athlete: true };
    case "conduct":
    case "eventSummary":
      return { coach: true, parent: true, athlete: true };
    default:
      return { coach: true, parent: false, athlete: false };
  }
}

export async function handleAddCoachNote(
  req: AddCoachNoteReq,
  ctx: { authUid?: string | null } = {}
) {
  const athleteUid = (req.athleteUid || "").trim();
  if (!athleteUid) throw new Error("athleteUid required");

  const type = (req.type || "athlete") as CoachNoteType;
  const body = (req.body || "").trim();
  if (!body) throw new Error("body required");

  const visibility = defaultVisibility(type);
  const actorUid = req.actorUid || ctx.authUid || "coach-local";

  const docRef = db.collection("coachNotes").doc();

  await docRef.set({
    id: docRef.id,
    athleteUid,
    type,
    title: req.title || null,
    body,
    visibility,
    linkedXp: req.linkedXp || null,
    linkedEventId: req.linkedEventId || null,
    meta: req.meta || null,
    createdBy: actorUid,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    source: "coach-notes",
  });

  return {
    ok: true,
    id: docRef.id,
    athleteUid,
    type,
  };
}
