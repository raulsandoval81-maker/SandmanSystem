// public/assets/js/firebase-init-para.js
// Para-Comms ONLY. Does not touch XP/Intake.
// Uses CDN ESM modules (stable exports)

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.1/firebase-app.js";

import {
  getFirestore,
  connectFirestoreEmulator,
  collection, doc, getDoc, getDocs, addDoc,
  setDoc, updateDoc, deleteDoc,
  query, where, orderBy, limit, onSnapshot,
    writeBatch,                  // ✅ ADD THIS
  serverTimestamp, Timestamp
} from "https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js";

import {
  getAuth,
  connectAuthEmulator,
  signInAnonymously,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.13.1/firebase-auth.js";

import {
  getFunctions,
  connectFunctionsEmulator,
  httpsCallable
} from "https://www.gstatic.com/firebasejs/10.13.1/firebase-functions.js";

// ------------------------------------------------------------
// 🔒 Hardcoded Config (Pilot Safe)
// ------------------------------------------------------------
const firebaseConfig = {
  apiKey: "AIzaSyDr8fZgWVCP_qBu2Ev9E2KtVay3lJcWJs4",
  authDomain: "sandmandashboard.firebaseapp.com",
  databaseURL: "https://sandmandashboard-default-rtdb.firebaseio.com",
  projectId: "sandmandashboard",
  storageBucket: "sandmandashboard.firebasestorage.app",
  messagingSenderId: "889326401061",
  appId: "1:889326401061:web:c259084eac7cd3289471cc"
};

export const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);
export const functions = getFunctions(app, "us-central1");

// ------------------------------------------------------------
// Emulator Detection (SAFE)
// - Never allow emulators on hosted domains (web.app/firebaseapp.com)
// - Only allow emulators on localhost or LAN IP while developing
// ------------------------------------------------------------
const host = window.location.hostname;

const isHostedProd =
  host.endsWith(".web.app") ||
  host.endsWith(".firebaseapp.com");

const isPrivateIp =
  /^10\./.test(host) ||
  /^192\.168\./.test(host) ||
  /^172\.(1[6-9]|2\d|3[0-1])\./.test(host);

// Only allow emulators when NOT hosted prod
const useEmu =
  !isHostedProd && (
    host === "localhost" ||
    host === "127.0.0.1" ||
    isPrivateIp ||
    location.search.includes("emu=1") // now safe because hosted prod blocks it
  );

if (useEmu) {
  const emuHost = (host === "localhost") ? "127.0.0.1" : host;

  console.log(
    `✅ [para emu] Firestore@${emuHost}:8081, Auth@${emuHost}:9099, Functions@${emuHost}:5001`
  );

  connectFirestoreEmulator(db, emuHost, 8081);
  connectAuthEmulator(auth, `http://${emuHost}:9099`, { disableWarnings: true });
  connectFunctionsEmulator(functions, emuHost, 5001);
} else {
  console.log("🌍 [para prod] using live Firebase services");
}// ------------------------------------------------------------
// Auth Guard (required for rules / callables)
// ------------------------------------------------------------
export async function ensureSignedIn() {
  if (auth.currentUser) return auth.currentUser;

  // Wait briefly for restored session
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

  // Fresh anon sign-in (with repair if persistence got poisoned)
  try {
    const cred = await signInAnonymously(auth);
    return cred.user;
  } catch (err) {
    console.warn("⚠️ para auth anon failed, repairing auth state...", err);

    // Repair: sign out + clear persisted auth
    try { await auth.signOut(); } catch {}

    // Clear firebase auth persistence (best-effort)
    try { indexedDB.deleteDatabase("firebaseLocalStorageDb"); } catch {}
    try {
      Object.keys(localStorage || {}).forEach((k) => {
        if (k.startsWith("firebase:authUser:")) localStorage.removeItem(k);
      });
    } catch {}

    const cred2 = await signInAnonymously(auth);
    return cred2.user;
  }
}
// ------------------------------------------------------------
// Re-exports (so Para pages stay clean)
// ------------------------------------------------------------
export {
  httpsCallable,
  collection, doc, getDoc, getDocs, addDoc,
  setDoc, updateDoc, deleteDoc,
  query, where, orderBy, limit, onSnapshot,
    writeBatch,                  // ✅ ADD THIS
  serverTimestamp, Timestamp
};

console.log("🔥 firebase-init-para loaded", host);
// DEV ONLY — lets you inspect in Console
window.PARA = { db, auth, functions };