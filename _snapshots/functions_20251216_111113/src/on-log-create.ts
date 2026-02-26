import * as functions from "firebase-functions";
import * as admin from "firebase-admin";

admin.initializeApp();
const db = admin.firestore();

const capsDocId = (track: string, monthKey: string) => `${track}_${monthKey}`;

export const onLogCreate = functions.firestore
  .document("users/{uid}/xp/{track}/logs/{logId}")
  .onCreate(async (snap, ctx) => {
    const { uid, track } = ctx.params as { uid: string; track: string };
    const log = snap.data() as any;
    const monthKey: string = log.monthKey; // "YYYY-MM"
    if (!monthKey) return;

    const capsRef = db.doc(`users/${uid}/caps/${capsDocId(track, monthKey)}`);
    const xpRef   = db.doc(`users/${uid}/xp/${track}`);

    // Load caps
    const capsSnap = await capsRef.get();
    const caps = capsSnap.exists ? capsSnap.data()! : {};

    let delta = 0;

    // ---- PRACTICE ----
    if (log.type === "attendance") {
      const current = Number(caps.attendance || 0);
      if (current < 120) { delta = 10; caps.attendance = current + 10; }
    }
    if (log.type === "practiceShark") {
      const current = Number(caps.shark || 0);
      if (current < 2) { delta = 5; caps.shark = current + 1; }
    }
    if (log.type === "fish") {
      const current = Number(caps.fish || 0);
      if (current < 4) { delta = -5; caps.fish = current + 1; }
    }

    // ---- TOURNAMENT ----
    if (log.type === "tournament" && log.badge === "show") {
      delta = 20;
    }

    // ---- STYLE (+5, max 2/mo total) ----
    if (log.type === "style") {
      const current = Number(caps.style || 0);
      if (current < 2) { delta = 5; caps.style = current + 1; }
    }

    // ---- PRESTIGE ----
    if (log.type === "prestige") {
      if (log.badge === "lion") {
        // state-weekend total cap (this only counts the lion portion)
        const wk = Number(caps.stateWeekend || 0);
        if (wk + 15 <= 50) { delta = 15; caps.stateWeekend = wk + 15; }
        else { delta = Math.max(0, 50 - wk); caps.stateWeekend = 50; }
      }
      if (log.badge === "tiger") delta = 50;
      if (log.badge === "bear")  delta = 100;
    }

    if (!delta) {
      functions.logger.info("log capped/no-op", { uid, track, type: log.type, badge: log.badge, caps });
      return;
    }

    // Apply XP and caps first
    await Promise.all([
      xpRef.set({ total: admin.firestore.FieldValue.increment(delta) }, { merge: true }),
      capsRef.set(caps, { merge: true }),
    ]);

    // -------- Leaderboard write (ADD THIS) --------
    try {
      // get latest total after increment
      const [xpSnap, userSnap] = await Promise.all([
        xpRef.get(),
        db.doc(`users/${uid}`).get().catch(() => null), // displayName is optional
      ]);

      const totalXP = Number(xpSnap.get("total") || 0);
      const displayName =
        (userSnap && userSnap.exists && (userSnap.data() as any).displayName) || "Unknown";

      // monthly leaderboard, do NOT mix tracks
      const lbRef = db.doc(`leaderboards/${track}/${monthKey}/${uid}`);
      await lbRef.set(
        {
          track,
          displayName,
          totalXP,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

      functions.logger.info("leaderboard updated", { uid, track, monthKey, totalXP });
    } catch (e) {
      functions.logger.warn("leaderboard update failed", { error: String(e), uid, track, monthKey });
    }
    // ----------------------------------------------
  });
