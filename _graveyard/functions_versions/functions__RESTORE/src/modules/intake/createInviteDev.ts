// functions/src/modules/intake/submitIntake.ts
import { onCall } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

type SubmitIntakeReq = {
  token?: string | null;
  athlete: {
    first: string;
    last?: string | null;
    dob?: string | null;
  };
  contact?: {
    email?: string | null;
    phone?: string | null;
  };
  emer?: {
    name?: string | null;
    phone?: string | null;
  };
  location?: {
    team?: string | null;
    city?: string | null;
    state?: string | null;
  };
  medical?: string | null;
  waiver?: {
    seen?: boolean;
    accepted?: boolean;
    sign?: string | null;
    signDate?: string | null;
    sigData?: string | null;
  };
};

export const submitIntake = onCall(async (request) => {
  const data = request.data as SubmitIntakeReq;

  if (!data || !data.athlete || !data.athlete.first?.trim()) {
    throw new Error("athlete.first is required");
  }

  // if they used an invite token, write to THAT doc
  const docId =
    (data.token && data.token.trim()) || db.collection("intakes").doc().id;

  const waiverAccepted = !!data.waiver?.accepted;

  await db
    .collection("intakes")
    .doc(docId)
    .set(
      {
        token: data.token ?? null,
        athlete: {
          first: data.athlete.first.trim(),
          last: data.athlete.last?.trim() || null,
          dob: data.athlete.dob || null,
        },
        contact: data.contact ?? {},
        emer: data.emer ?? {},
        location: data.location ?? {},
        medical: data.medical ?? null,
        waiver: {
          status: waiverAccepted ? "accepted" : "pending",
          seen: !!data.waiver?.seen,
          accepted: waiverAccepted,
          sign: data.waiver?.sign || "",
          signDate: data.waiver?.signDate || "",
          sigData: data.waiver?.sigData || null,
        },
        status: "submitted",
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

  return { ok: true, intakeId: docId, status: "submitted" };
});
