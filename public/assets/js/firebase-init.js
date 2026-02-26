// public/assets/js/firebase-init.js
// IMPORTANT:
// All callable functions MUST use this exported `functions` instance.
// Do NOT re-initialize Firebase or Functions in page-level scripts.

// ----------------------------------------------------
// ✅ Firebase Web App Config (REQUIRED)
// Replace the values with your real project config from Firebase Console.
// ----------------------------------------------------
const firebaseConfig = {
  apiKey: "AIzaSyDr8fZgWVCP_qBu2Ev9E2KtVay3lJcWJs4",
  authDomain: "sandmandashboard.firebaseapp.com",
  databaseURL: "https://sandmandashboard-default-rtdb.firebaseio.com",
  projectId: "sandmandashboard",
  storageBucket: "sandmandashboard.firebasestorage.app",
  messagingSenderId: "889326401061",
  appId: "1:889326401061:web:c259084eac7cd3289471cc"
};
// ---- Core App ----
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.1/firebase-app.js";

// ---- Firestore ----
import {
  getFirestore,
  connectFirestoreEmulator,
  collection,
  query,
  where,
  orderBy,
  limit,
  getDocs,
  onSnapshot,
  serverTimestamp,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  addDoc
} from "https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js";

// ---- Auth ----
import {
  getAuth,
  connectAuthEmulator,
  signInAnonymously,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.13.1/firebase-auth.js";

// ---- Functions ----
import {
  getFunctions,
  connectFunctionsEmulator,
  httpsCallable
} from "https://www.gstatic.com/firebasejs/10.13.1/firebase-functions.js";

// ----------------------------------------------------
// 1) Initialize App FIRST (no references before this)
// ----------------------------------------------------
const app = initializeApp(firebaseConfig);

// ----------------------------------------------------
// 2) Create handles ONCE (single source of truth)
// ----------------------------------------------------
const db = getFirestore(app);
const auth = getAuth(app);

// IMPORTANT: region must match your functions region
// (your emulator URL shows us-central1)
const functions = getFunctions(app, "us-central1");

console.log("🔥 firebase-init loaded", location.hostname);

// ----------------------------------------------------
// 3) Emulator wiring (Local + LAN-safe “key code”)
// ----------------------------------------------------
const host = window.location.hostname;

// RFC1918 / private IP detection (LAN phones safe)
const isPrivateIp =
  /^10\./.test(host) ||
  /^192\.168\./.test(host) ||
  /^172\.(1[6-9]|2\d|3[0-1])\./.test(host);

// Use emulators if local OR LAN OR manual override (?emu=1)
const useEmu =
  host === "localhost" ||
  host === "127.0.0.1" ||
  isPrivateIp ||
  location.search.includes("emu=1");

if (useEmu) {
  // ✅ Use SAME host the page loaded from (Mac + phone LAN-safe)
const emuHost = (host === "localhost") ? "127.0.0.1" : host;
  console.log(
    `✅ [emu] Firestore@${emuHost}:8081, Auth@${emuHost}:9099, Functions@${emuHost}:5001`
  );

  connectFirestoreEmulator(db, emuHost, 8081);
  connectAuthEmulator(auth, `http://${emuHost}:9099`, { disableWarnings: true });
  connectFunctionsEmulator(functions, emuHost, 5001);
} else {
  console.log("🌍 [prod] using live Firebase services");
}

// ----------------------------------------------------
// 4) Auth guard for callable functions (req.auth)
// Ensures req.auth exists for onCall() (v1 or v2)
// ----------------------------------------------------
async function ensureSignedIn() {
  if (auth.currentUser) return auth.currentUser;

  // Wait briefly for cached auth state first
  const existing = await new Promise((resolve) => {
    let done = false;

    const unsub = onAuthStateChanged(auth, (u) => {
      if (done) return;
      done = true;
      try { unsub(); } catch {}
      resolve(u || null);
    });

    setTimeout(() => {
      if (done) return;
      done = true;
      try { unsub(); } catch {}
      resolve(auth.currentUser || null);
    }, 600);
  });

  if (existing) return existing;

  const cred = await signInAnonymously(auth);
  return cred.user;
}

// ----------------------------------------------------
// 5) Exports (single source of truth)
// ----------------------------------------------------
export {
  app,
  db,
  auth,
  functions,
  httpsCallable,
  ensureSignedIn,

  collection,
  query,
  where,
  orderBy,
  limit,
  getDocs,
  onSnapshot,
  serverTimestamp,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  addDoc
};
