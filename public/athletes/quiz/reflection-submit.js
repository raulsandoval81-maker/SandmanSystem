/* ============================================================
   REFLECTION — SUBMIT ENGINE
   Saves the athlete’s older-division self-reflection
   (sliders only — no yes/no)
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
export async function submitReflection() {

  const user = auth.currentUser;
  if (!user) {
    alert("Login required.");
    return;
  }

  const uid = user.uid;

  // Read every slider on page
  const sliders = [...document.querySelectorAll(".slider-input")];
  const answers = {};

  sliders.forEach(sl => {
    answers[sl.name] = Number(sl.value);
  });

  // Mini profile (created from hub.js)
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

  // Save "current" reflection
  const ref = doc(db, "athletes", uid, "selfReflections", "current");
  await setDoc(ref, payload, { merge: true });

  // Stamp athlete root
  const athleteRef = doc(db, "athletes", uid);
  await setDoc(athleteRef, {
    lastReflectionAt: serverTimestamp()
  }, { merge: true });

  // Redirect to tools
  window.location.href = "../index.html";
}


// Button handler
document.getElementById("submitReflection").addEventListener("click", submitReflection);
