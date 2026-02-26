/* ============================================================
   DESTINY — SUBMIT ENGINE
   Saves the athlete’s current self-assessment (sliders only)
   ============================================================ */

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getFirestore, doc, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

// ---- Firebase boots ----
const firebaseConfig = window._firebaseConfig;
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);


// ---- Submit Handler ----
export async function submitDestiny() {

  const user = auth.currentUser;
  if (!user) {
    alert("Login required.");
    return;
  }

  const uid = user.uid;

  // Read all slider inputs on the page
  const sliders = [...document.querySelectorAll(".slider-input")];
  const answers = {};

  sliders.forEach(sl => {
    answers[sl.name] = Number(sl.value);
  });

  // Mini profile (created in STEP 8 → Hub → Quiz)
  const mini = JSON.parse(localStorage.getItem("miniProfile") || "{}");

  const payload = {
    miniProfile: {
      name: mini.name || "",
      team: mini.team || "",
      cityState: mini.cityState || "",
      lane: mini.lane || "",
      tier: mini.tier || "",
      mintTag: mini.mint || "",
    },
    answers,
    submittedAt: serverTimestamp()
  };

  // Write to Firestore
  const ref = doc(db, "athletes", uid, "selfAssessments", "current");
  await setDoc(ref, payload, { merge: true });

  // Lock timestamp on athlete root
  const athleteRef = doc(db, "athletes", uid);
  await setDoc(athleteRef, {
    lastAssessmentAt: serverTimestamp()
  }, { merge: true });

  // Redirect to TOOLS
  window.location.href = "../index.html";
}

// Attach to button
document.getElementById("submitDestiny").addEventListener("click", submitDestiny);
