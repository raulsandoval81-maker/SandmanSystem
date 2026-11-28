import * as crypto from "crypto";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import {
  AVATAR_STYLE_VERSION,
  avatarRequiresGuardian,
  avatarShirtColor,
  illustratedAvatarSvg,
  validateAvatarRaster,
} from "./athleteAvatarPolicy";

const REQUESTS = "athleteAvatarRequests";

function requireUser(auth: any): string {
  if (!auth?.uid || auth.token?.firebase?.sign_in_provider === "anonymous") {
    throw new HttpsError("unauthenticated", "Sign-in required.");
  }
  return String(auth.uid);
}

async function resolveSelfAthlete(uid: string) {
  const db = getFirestore();
  const exact = await db.doc(`athletes/${uid}`).get();
  if (exact.exists) {
    const athlete = exact.data() || {};
    if ((athlete.authUid == null && exact.id === uid) || athlete.authUid === uid) {
      return { athleteId: exact.id, athlete, ref: exact.ref };
    }
  }
  const matches = await db.collection("athletes").where("authUid", "==", uid).limit(2).get();
  if (matches.size !== 1) throw new HttpsError("permission-denied", "Athlete ownership could not be verified.");
  const match = matches.docs[0];
  if (match.data().authUid !== uid) throw new HttpsError("permission-denied", "Athlete ownership could not be verified.");
  return { athleteId: match.id, athlete: match.data(), ref: match.ref };
}

async function isGuardian(uid: string, athleteId: string, athlete: Record<string, any>): Promise<boolean> {
  if (String(athlete.parentUid || "").trim() === uid) return true;
  const links = await getFirestore().collection("parentAthleteLinks")
    .where("parentUid", "==", uid).where("athleteUid", "==", athleteId)
    .where("status", "==", "active").limit(1).get();
  return !links.empty;
}

function cleanRequestId(value: unknown): string {
  const id = String(value || "").trim();
  if (!/^[a-f0-9-]{36}$/.test(id)) throw new HttpsError("invalid-argument", "Valid avatar request required.");
  return id;
}

async function requestContext(uid: string, requestId: string) {
  const db = getFirestore();
  const requestRef = db.collection(REQUESTS).doc(requestId);
  const requestSnap = await requestRef.get();
  if (!requestSnap.exists) throw new HttpsError("not-found", "Avatar request not found.");
  const request = requestSnap.data() || {};
  const athleteSnap = await db.collection("athletes").doc(String(request.athleteId || "")).get();
  if (!athleteSnap.exists) throw new HttpsError("failed-precondition", "Athlete profile unavailable.");
  return { db, requestRef, request, athleteRef: athleteSnap.ref, athlete: athleteSnap.data() || {}, athleteId: athleteSnap.id };
}

async function faceDataUrl(path: string): Promise<string> {
  const [bytes] = await getStorage().bucket().file(path).download();
  if (bytes.length > 4_000_000) throw new HttpsError("resource-exhausted", "Avatar preview is too large.");
  return `data:image/svg+xml;base64,${bytes.toString("base64")}`;
}

export const createAthleteAvatarDraft = onCall({ memory: "512MiB", timeoutSeconds: 60 }, async (req) => {
  const uid = requireUser(req.auth);
  const { athleteId, athlete } = await resolveSelfAthlete(uid);
  const base64 = String(req.data?.photoBase64 || "");
  if (base64.length > 3_400_000 || !/^[A-Za-z0-9+/=]+$/.test(base64)) {
    throw new HttpsError("invalid-argument", "A valid photo is required.");
  }
  const bytes = Buffer.from(base64, "base64");
  let mime: string;
  try { mime = validateAvatarRaster(req.data?.contentType, bytes); }
  catch { throw new HttpsError("invalid-argument", "Use a JPEG, PNG, or WebP photo under 2.5 MB."); }

  const requestId = crypto.randomUUID();
  const root = `athlete-avatars/${athleteId}/${requestId}`;
  const sourcePath = `${root}/original`;
  const previewPath = `${root}/face.svg`;
  const bucket = getStorage().bucket();
  await bucket.file(sourcePath).save(bytes, {
    resumable: false, contentType: mime, validation: "md5",
    metadata: { cacheControl: "private,no-store,max-age=0", metadata: { athleteId, requestId, kind: "private-original" } },
  });
  const svg = illustratedAvatarSvg(mime, bytes);
  await bucket.file(previewPath).save(Buffer.from(svg), {
    resumable: false, contentType: "image/svg+xml", validation: "md5",
    metadata: { cacheControl: "private,no-store,max-age=0", metadata: { athleteId, requestId, kind: "private-preview", styleVersion: AVATAR_STYLE_VERSION } },
  });
  const guardianRequired = avatarRequiresGuardian(athlete, athleteId);
  await getFirestore().collection(REQUESTS).doc(requestId).create({
    athleteId, authUid: uid, sourcePath, previewPath, styleVersion: AVATAR_STYLE_VERSION,
    sourceSha256: crypto.createHash("sha256").update(bytes).digest("hex"),
    status: guardianRequired ? "guardian_pending" : "preview_ready",
    guardianRequired, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
  });
  return { requestId, status: guardianRequired ? "guardian_pending" : "preview_ready",
    guardianRequired, previewDataUrl: `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`,
    shirtColor: avatarShirtColor(athlete) };
});

export const getAthleteAvatarState = onCall(async (req) => {
  const uid = requireUser(req.auth);
  const supplied = String(req.data?.requestId || "").trim();
  let context;
  if (supplied) {
    context = await requestContext(uid, cleanRequestId(supplied));
    const self = context.athlete.authUid === uid || (context.athlete.authUid == null && context.athleteId === uid);
    if (!self && !await isGuardian(uid, context.athleteId, context.athlete)) {
      throw new HttpsError("permission-denied", "Avatar access denied.");
    }
  } else {
    const self = await resolveSelfAthlete(uid);
    const latest = await getFirestore().collection(REQUESTS).where("athleteId", "==", self.athleteId).limit(20).get();
    if (latest.empty) return { status: "none", shirtColor: avatarShirtColor(self.athlete) };
    const newest = latest.docs.sort((a, b) =>
      Number(b.data().createdAt?.toMillis?.() || 0) - Number(a.data().createdAt?.toMillis?.() || 0))[0];
    context = await requestContext(uid, newest.id);
  }
  return { requestId: context.requestRef.id, status: context.request.status,
    guardianRequired: context.request.guardianRequired === true,
    previewDataUrl: await faceDataUrl(String(context.request.previewPath)),
    shirtColor: avatarShirtColor(context.athlete), styleVersion: context.request.styleVersion };
});

export const approveAthleteAvatar = onCall(async (req) => {
  const uid = requireUser(req.auth);
  const requestId = cleanRequestId(req.data?.requestId);
  const context = await requestContext(uid, requestId);
  const self = context.athlete.authUid === uid || (context.athlete.authUid == null && context.athleteId === uid);
  const guardian = await isGuardian(uid, context.athleteId, context.athlete);
  if (context.request.guardianRequired === true ? !guardian : !self) {
    throw new HttpsError("permission-denied", context.request.guardianRequired ? "Guardian approval required." : "Athlete approval required.");
  }
  await context.db.runTransaction(async (tx) => {
    const latest = await tx.get(context.requestRef);
    const value = latest.data() || {};
    if (!latest.exists || !["guardian_pending", "preview_ready", "approved"].includes(value.status)) {
      throw new HttpsError("failed-precondition", "Avatar request is not approvable.");
    }
    if (value.status === "approved") return;
    tx.update(context.requestRef, { status: "approved", approvedBy: uid, approvedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
    tx.update(context.athleteRef, { avatar: { requestId, facePath: value.previewPath, styleVersion: value.styleVersion,
      approvedAt: FieldValue.serverTimestamp(), approvedBy: uid }, updatedAt: FieldValue.serverTimestamp() });
  });
  await getStorage().bucket().file(String(context.request.sourcePath)).delete({ ignoreNotFound: true });
  await context.requestRef.update({ originalDeletedAt: FieldValue.serverTimestamp() });
  return { ok: true, requestId, status: "approved", shirtColor: avatarShirtColor(context.athlete) };
});
