// functions/src/modules/notes/addCoachNote.ts
import * as functions from "firebase-functions";
import {
  handleAddCoachNote,
  type AddCoachNoteReq,
} from "./addCoachNoteCore";

export const addCoachNote = functions.https.onCall(
  async (req: unknown, context: any) => {
    try {
      const data = (req || {}) as AddCoachNoteReq;

      return await handleAddCoachNote(data, {
        authUid: context?.auth?.uid ?? null,
      });
    } catch (err: any) {
      console.error("[addCoachNote] crash:", err);
      throw new functions.https.HttpsError(
        "invalid-argument",
        err?.message || "note error"
      );
    }
  }
);
