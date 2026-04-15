// functions/src/modules/notes/addCoachNote.ts
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { handleAddCoachNote, type AddCoachNoteReq } from "./addCoachNoteCore";

export const addCoachNote = onCall(async (req) => {
  try {
    const data = (req.data || {}) as AddCoachNoteReq;

    return await handleAddCoachNote(data, {
      authUid: req.auth?.uid ?? null,
    });
  } catch (err: any) {
    console.error("[addCoachNote] crash:", err);
    throw new HttpsError("invalid-argument", err?.message || "note error");
  }
});
