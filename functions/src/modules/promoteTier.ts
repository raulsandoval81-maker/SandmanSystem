import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

type Base = "F4" | "F8";

const XP = Object.freeze({
  F4: {
    tierCaps: { T0: 1200, T1: 1600, T2: 2000, T3: 2400, T4: 2800 },
    tiers: ["T0", "T1", "T2", "T3", "T4"],
  },
  F8: {
    tierCaps: { T0: 800, T1: 1000, T2: 1200, T3: 1400, T4: 1600, T5: 1800, T6: 2000, T7: 2400 },
    tiers: ["T0", "T1", "T2", "T3", "T4", "T5", "T6", "T7"],
  },
} as const);

function isEmulator(): boolean {
  return process.env.FUNCTIONS_EMULATOR === "true" || !!process.env.FIREBASE_EMULATOR_HUB;
}

function normalizeBaseFromAthlete(a: any): Base {
  const raw = String(a?.trackBase || a?.track || a?.program || a?.base || "").toUpperCase();
  if (raw.startsWith("F8") || raw.includes("FOUNDRY8") || raw.includes("YOUTH")) return "F8";
  return "F4";
}

function normalizeTier(a: any): string {
  if (typeof a?.tier === "string" && a.tier.startsWith("T")) return a.tier;
  if (typeof a?.tier === "number") return `T${a.tier}`;
  if (typeof a?.rank === "string" && a.rank.startsWith("T")) return a.rank;
  return "T0";
}

function monthKey(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

export const promoteTier = onCall(async (req) => {
  // ✅ keep this emulator-only until you add real auth/roles
  if (!isEmulator()) {
    throw new HttpsError("failed-precondition", "promoteTier is emulator-only right now.");
  }

  const db = getFirestore();
  const payload = req.data || {};
  const uid = String(payload.uid || "").trim();
  const note = typeof payload.note === "string" ? payload.note.trim() : "";

  if (!uid) throw new HttpsError("invalid-argument", "Missing uid");

  const athleteRef = db.collection("athletes").doc(uid);
  const mKey = monthKey();
  const logRef = db.collection("xp_logs").doc();

  const result = await db.runTransaction(async (tx) => {
    const snap = await tx.get(athleteRef);
    if (!snap.exists) throw new HttpsError("not-found", `Athlete not found: ${uid}`);

    const athlete = snap.data() || {};
    const base = normalizeBaseFromAthlete(athlete);
    const tier = normalizeTier(athlete);

    const tiers = XP[base].tiers as unknown as string[];
    const caps = XP[base].tierCaps as unknown as Record<string, number>;

    const idx = tiers.indexOf(tier);
    if (idx < 0) throw new HttpsError("failed-precondition", `Unknown tier: ${tier}`);
    if (idx >= tiers.length - 1) {
      return { ok: true, blocked: true, reason: "MAX_TIER_REACHED", uid, base, tier };
    }

    const cap = Number(caps[tier] ?? 0);
    if (!cap) throw new HttpsError("failed-precondition", `Missing cap for ${base} ${tier}`);

    const beforeXp = Number(athlete.xp ?? 0);
    if (beforeXp < cap) {
      return {
        ok: true,
        blocked: true,
        reason: "NOT_READY",
        uid, base, tier,
        beforeXp, cap,
      };
    }

    const nextTier = tiers[idx + 1];
    const nextCap = Number(caps[nextTier] ?? 0);
    if (!nextCap) throw new HttpsError("failed-precondition", `Missing cap for ${base} ${nextTier}`);

    // ✅ reset to 0 on promotion
    tx.set(
      athleteRef,
      {
        tier: nextTier,
        xp: 0,
        xpCap: nextCap,
        stripeCount: 0,
        trackBase: base,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    tx.set(logRef, {
      uid,
      kind: "PROMOTION",
      amount: 0,
      note: note || `Promoted ${tier} → ${nextTier}`,
      meta: { fromTier: tier, toTier: nextTier },
      base,
      tier: nextTier,
      beforeXp,
      afterXp: 0,
      cap: nextCap,
      month: mKey,
      createdAt: FieldValue.serverTimestamp(),
    });

    return {
      ok: true,
      blocked: false,
      uid,
      base,
      fromTier: tier,
      toTier: nextTier,
      beforeXp,
      afterXp: 0,
      cap: nextCap,
      stripeCount: 0,
      logId: logRef.id,
    };
  });

  return result;
});
