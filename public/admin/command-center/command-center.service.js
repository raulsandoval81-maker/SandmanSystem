import { functions, httpsCallable } from "/assets/js/firebase-init.js";

const snapshotCall = httpsCallable(functions, "getCommandCenterSnapshot");
const saveCall = httpsCallable(functions, "saveCommandCenterProject");
const archiveCall = httpsCallable(functions, "archiveCommandCenterProject");

export async function loadCommandCenter() {
  return (await snapshotCall({})).data;
}

export async function saveProject(projectId, project) {
  return (await saveCall({ projectId: projectId || "", project })).data;
}

export async function archiveProject(projectId) {
  return (await archiveCall({ projectId })).data;
}
