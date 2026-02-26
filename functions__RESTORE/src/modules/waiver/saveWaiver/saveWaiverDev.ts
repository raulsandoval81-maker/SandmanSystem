// functions/src/modules/waiver/saveWaiverDev.ts
import * as admin from "firebase-admin";
import * as functions from "firebase-functions";

function allowCors(res: any) {
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Methods", "POST,OPTIONS");
  res.set("Access-Control-Allow-Headers", "Content-Type,Authorization");
}

export const saveWaiverDev = functions.https.onRequest(
  async (req, res): Promise<void> => {
    allowCors(res);
    if (req.method === "OPTIONS") { res.status(204).end(); return; }
    if (req.method !== "POST") { res.status(405).json({ ok:false, error:"method_not_allowed" }); return; }

    try {
      const { intakeId, athleteUid } = (req.body || {}) as { intakeId?: string; athleteUid?: string; };
      if (!intakeId || !athleteUid) { res.status(400).json({ ok:false, error:"missing_required_fields" }); return; }

      const db = admin.firestore();
      const ts = admin.firestore.FieldValue.serverTimestamp();
      const waiverId = db.collection("_ids").doc().id;

      await db.collection("intakes").doc(intakeId).set({
        waiver: { status:"accepted", waiverId, filePath:null, ackOnly:true, acceptedAt: ts }
      }, { merge:true });

      await db.collection("waiverLogs").doc(waiverId).set({
        waiverId, intakeId, athleteUid, filePath:null, ackOnly:true, createdAt: ts
      });

      res.json({ ok:true, waiverId, filePath:null, ackOnly:true });
    } catch (e:any) {
      console.error("[saveWaiverDev] error", e);
      res.status(500).json({ ok:false, error:String(e?.message || e) });
    }
  }
);
