// functions/src/modules/xp/incrementXp.ts
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { handleIncrementXp, type IncrementXpReq } from "./incrementXpCore";

export const incrementXp = onCall<IncrementXpReq>(async (request) => {
  try {
    const data = request.data;
    const authUid = request.auth?.uid ?? null;
    return await handleIncrementXp(data, { authUid });
  } catch (err: any) {
    throw new HttpsError("invalid-argument", err?.message || "xp error");
  }
});
