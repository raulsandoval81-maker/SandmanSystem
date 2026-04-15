import { db } from "/assets/js/firebase-init.js";
import {
  collection,
  getDocs,
  doc,
  setDoc
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

export async function loadStaffRows() {
  const snap = await getDocs(collection(db, "staff"));
  return snap.docs.map(d => ({
    uid: d.id,
    ...d.data()
  }));
}

export async function saveStaffRole(uid, role) {
  if (!uid) throw new Error("Missing UID");
  if (!["coach", "admin"].includes(role)) {
    throw new Error("Invalid role");
  }

  await setDoc(doc(db, "staff", uid), {
    role,
    updatedAt: new Date()
  }, { merge: true });
}