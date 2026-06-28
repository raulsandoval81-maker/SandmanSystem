import { onRequest } from "firebase-functions/v2/https";
import { getFirestore } from "firebase-admin/firestore";
import * as admin from "firebase-admin";

if (!admin.apps.length) {
  admin.initializeApp();
}

export const coachAction = onRequest(async (req, res) => {
  try {
    const db = getFirestore();

    const { type, athleteId } = req.body;

    const athleteRef = db.collection("athletes").doc(athleteId);
    const athlete = await athleteRef.get();

    if (!athlete.exists) {
      res.status(404).json({ error: "Athlete not found" });
      return;
    }

    let update: any = {};

    switch (type) {
      case "SCHEDULE_TEST":
        update = { "testing.state": "SCHEDULED" };
        break;

      case "START_TEST":
        update = { "testing.state": "ACTIVE" };
        break;

      case "FREEZE":
        update = { "testing.state": "FROZEN" };
        break;

      case "RETEST":
        update = { "testing.state": "RETEST" };
        break;

      case "APPROVE_PROMOTION":
        update = {
          "testing.lastTestResult": "pass",
          promotionCompletedAt: Date.now()
        };
        break;

      case "DELAY_PROMOTION":
        update = { promotionDelayed: true };
        break;

      case "TRIGGER_CEREMONY":
        update = { ceremonyCompletedAt: Date.now() };
        break;

      default:
        res.status(400).json({ error: "Unknown action" });
        return;
    }

    await athleteRef.update(update);

    res.json({
      ok: true,
      athleteId,
      type,
      update
    });

    return; // IMPORTANT: end function cleanly

  } catch (err: any) {
    res.status(500).json({ error: err.message });
    return;
  }
});