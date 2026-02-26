/* ============================================================
   REFLECTION — ARCHIVE ENGINE
   Moves the older-division reflection into history bucket
   ============================================================ */

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  deleteDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

// ---- Firebase boots ----
const firebaseConfig = window._firebaseConfig;
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);


// ---- Archive Handler ----
export async function archiveReflection() {

  const user = auth.currentUser;
  if (!user) {
    alert("Login required.");
    return;
  }

  const uid = user.uid;
  const now = new Date();
  const bucket = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}`;

  const currentRef = doc(db, "athletes", uid, "selfReflections", "current");
  const snap = await getDoc(currentRef);

  if (!snap.exists()) {
    alert("No current reflection found.");
    return;
  }

  const data = snap.data();

  // Write to history bucket
  const historyRef = doc(db, "athletes", uid, "selfReflections", "history", bucket);
  await setDoc(historyRef, {
    ...data,
    archivedAt: serverTimestamp()
  });

  // Remove current
  await deleteDoc(currentRef);

  alert("Reflection archived for graduation.");
}


// Button handler
document.getElementById("archiveReflection")?.addEventListener("click", archiveReflection);
