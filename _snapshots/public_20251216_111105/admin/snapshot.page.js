// public/admin/snapshot.page.js
// ESM imports via Firebase CDN (same versioning style you used)
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.5.2/firebase-app.js";
import {
  getFirestore,
  collection,
  query,
  orderBy,
  onSnapshot,
} from "https://www.gstatic.com/firebasejs/10.5.2/firebase-firestore.js";
import {
  getAuth,
  onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/10.5.2/firebase-auth.js";

/**
 * Call this from dashboard.service.js
 * It bootstraps Firebase, checks auth, and renders a live list of athletes.
 */
export function initSnapshot() {
  // TODO: replace with your real values (or import from a shared init file)
  const firebaseConfig = {
    apiKey: "YOUR_API_KEY",
    authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
    projectId: "YOUR_PROJECT_ID",
    storageBucket: "YOUR_PROJECT_ID.appspot.com",
    messagingSenderId: "000000",
    appId: "YOUR_APP_ID",
  };

  // Init
  const app = initializeApp(firebaseConfig);
  const db = getFirestore(app);
  const auth = getAuth(app);

  // When auth state changes, either load data or prompt to sign in
  onAuthStateChanged(auth, (user) => {
    if (user) {
      console.log("Coach signed in:", user.email);
      loadAthletes(db);
    } else {
      setHtml("#athleteList", "<p>Please sign in to view data.</p>");
    }
  });

  // --- helpers ---
  function setHtml(sel, html) {
    const el = document.querySelector(sel);
    if (el) el.innerHTML = html;
  }

  function loadAthletes(db) {
    const ref = collection(db, "athletes");
    const q = query(ref, orderBy("name"));

    onSnapshot(q, (snap) => {
      let html = "";
      snap.forEach((doc) => {
        const a = doc.data() || {};
        html += `
          <div class="athlete-card">
            <h3>${a.name ?? "Unnamed"}</h3>
            <p>XP: ${a.xp ?? 0}</p>
            <p>Tier: ${a.tier ?? "N/A"}</p>
          </div>`;
      });
      setHtml("#athleteList", html || "<p>No athletes yet.</p>");
    });
  }
}
