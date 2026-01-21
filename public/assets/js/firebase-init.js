// public/assets/js/firebase-init.js
// IMPORTANT:
// All callable functions MUST use this exported `functions` instance.
// Do NOT re-initialize Firebase or Functions in page-level scripts.

// ---- Core App ----
import {
  initializeApp
} from "https://www.gstatic.com/firebasejs/10.13.1/firebase-app.js";

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
  connectAuthEmulator
} from "https://www.gstatic.com/firebasejs/10.13.1/firebase-auth.js";

// ---- Functions ----
import {
  getFunctions,
  connectFunctionsEmulator,
  httpsCallable,
} from "https://www.gstatic.com/firebasejs/10.13.1/firebase-functions.js";

// 1) Firebase config (demo for local)
const firebaseConfig = {
  apiKey: "demo",
  authDomain: "demo.firebaseapp.com",
  projectId: "sandmandashboard",
};

// 2) Initialize app
const app = initializeApp(firebaseConfig);

// 3) Create handles
const db = getFirestore(app);
const auth = getAuth(app);
const functions = getFunctions(app);

// 4) Connect to emulators when local OR LAN
const host = window.location.hostname;

// RFC1918 / local detection (localhost + LAN IPs)
const isPrivateIp =
  /^10\./.test(host) ||
  /^192\.168\./.test(host) ||
  /^172\.(1[6-9]|2\d|3[0-1])\./.test(host);

const useEmu =
  host === "localhost" ||
  host === "127.0.0.1" ||
  isPrivateIp ||
  location.search.includes("emu=1");

if (useEmu) {
  // ✅ BULLETPROOF RULE:
  // Use the SAME host the page loaded from.
  // - Mac: host is localhost or 127.0.0.1 (works)
  // - Phone: host is your Mac LAN IP (works)
  const emuHost = host;

  console.log(
    `[emu] Firestore@${emuHost}:8081, Auth@${emuHost}:9099, Functions@${emuHost}:5001 (sandmandashboard)`
  );

  connectFirestoreEmulator(db, emuHost, 8081);
  connectAuthEmulator(auth, `http://${emuHost}:9099`, { disableWarnings: true });
  connectFunctionsEmulator(functions, emuHost, 5001);
}

// 5) Export ready handles
export {
  app,
  db,
  auth,
  functions,
  httpsCallable,    // <- needed for createAthlete test
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

