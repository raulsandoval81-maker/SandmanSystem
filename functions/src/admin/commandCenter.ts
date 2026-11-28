import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import {
  assertArchivable,
  assertCommandCenterTransition,
  isCommandCenterOwnerStaff,
  validateCommandCenterProject,
} from "./commandCenterPolicy";

const PROJECTS = "adminCommandCenterProjects";

async function requireOwner(uid: unknown) {
  const cleanUid = String(uid ?? "").trim();
  if (!cleanUid) throw new HttpsError("unauthenticated", "Owner authentication required.");
  const snap = await getFirestore().doc(`staff/${cleanUid}`).get();
  if (!snap.exists || !isCommandCenterOwnerStaff(snap.data() || {})) {
    throw new HttpsError("permission-denied", "Command Center owner access required.");
  }
  return cleanUid;
}

export const getCommandCenterSnapshot = onCall(async (request) => {
  const actorUid = await requireOwner(request.auth?.uid);
  const db = getFirestore();
  const snap = await db.collection(PROJECTS).orderBy("updatedAt", "desc").limit(200).get();
  const projects = await Promise.all(snap.docs.map(async (project) => {
    const history = await project.ref.collection("history").orderBy("at", "desc").limit(25).get();
    return {
      id: project.id,
      ...project.data(),
      history: history.docs.map((entry) => ({ id: entry.id, ...entry.data() })),
    };
  }));
  return { actorUid, projects };
});

export const saveCommandCenterProject = onCall(async (request) => {
  const actorUid = await requireOwner(request.auth?.uid);
  const input = request.data && typeof request.data === "object" ? request.data as Record<string, unknown> : {};
  const projectId = String(input.projectId ?? "").trim();
  if (projectId && !/^[A-Za-z0-9_-]{1,120}$/.test(projectId)) {
    throw new HttpsError("invalid-argument", "projectId is invalid.");
  }
  const project = validateCommandCenterProject(input.project);
  const db = getFirestore();
  const ref = projectId ? db.collection(PROJECTS).doc(projectId) : db.collection(PROJECTS).doc();

  await db.runTransaction(async (tx) => {
    const currentSnap = await tx.get(ref);
    const current = currentSnap.exists ? currentSnap.data() || {} : null;
    assertCommandCenterTransition(current?.lifecycleStatus, project.lifecycleStatus, project.workType);
    const projectKeys = Object.keys(project) as Array<keyof typeof project>;
    const changedFields = current
      ? projectKeys.filter((key) => JSON.stringify(current[key]) !== JSON.stringify(project[key]))
      : projectKeys;
    const now = FieldValue.serverTimestamp();
    tx.set(ref, {
      ...project,
      createdAt: current?.createdAt || now,
      createdBy: current?.createdBy || actorUid,
      updatedAt: now,
      updatedBy: actorUid,
      archivedAt: null,
    });
    tx.create(ref.collection("history").doc(), {
      action: current ? "updated" : "created",
      fromStatus: current?.lifecycleStatus || null,
      toStatus: project.lifecycleStatus,
      workState: project.workState,
      changedFields,
      evidenceCount: project.milestones.reduce((count, milestone) => count
        + milestone.sprints.reduce((sprintCount, sprint) => sprintCount
          + sprint.tasks.reduce((taskCount, task) => taskCount + task.evidence.length, 0), 0), 0),
      at: now,
      actorUid,
    });
  });
  return { ok: true, projectId: ref.id };
});

export const archiveCommandCenterProject = onCall(async (request) => {
  const actorUid = await requireOwner(request.auth?.uid);
  const projectId = String(request.data?.projectId ?? "").trim();
  if (!/^[A-Za-z0-9_-]{1,120}$/.test(projectId)) throw new HttpsError("invalid-argument", "projectId is invalid.");
  const db = getFirestore();
  const ref = db.collection(PROJECTS).doc(projectId);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new HttpsError("not-found", "Project record not found.");
    assertArchivable(snap.data()?.lifecycleStatus);
    const now = FieldValue.serverTimestamp();
    tx.update(ref, { lifecycleStatus: "archived", workState: "active", archivedAt: now, updatedAt: now, updatedBy: actorUid });
    tx.create(ref.collection("history").doc(), {
      action: "archived", fromStatus: "final_acceptance", toStatus: "archived", workState: "active",
      changedFields: ["lifecycleStatus", "archivedAt"], evidenceCount: 0,
      at: now, actorUid,
    });
  });
  return { ok: true, projectId };
});
