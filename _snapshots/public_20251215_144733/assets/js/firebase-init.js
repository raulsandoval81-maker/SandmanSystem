// public/assets/js/firebase-init.js

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

// 4) Connect to emulators when local
const useEmu =
  location.hostname === "localhost" ||
  location.hostname === "127.0.0.1" ||
  location.search.includes("emu=1");

if (useEmu) {
  console.log("[emu] Firestore@8081, Auth@9099, Functions@5001 (project sandmandashboard)");
  connectFirestoreEmulator(db, "localhost", 8081);
  connectAuthEmulator(auth, "http://localhost:9099");
  connectFunctionsEmulator(functions, "localhost", 5001); // <- matches your emulator output
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
