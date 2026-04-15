// /data/firebase-init.js
import { initializeApp } from "/vendor/firebase/10.13.1/firebase-app.js";
import { getAuth } from "/vendor/firebase/10.13.1/firebase-auth.js";
import {
  getFirestore,
  collection, doc, getDoc, getDocs, addDoc,
  setDoc, updateDoc, deleteDoc,
  query, where, orderBy, limit, onSnapshot,
  serverTimestamp, Timestamp
} from "/vendor/firebase/10.13.1/firebase-firestore.js";
import { getFunctions, httpsCallable } from "/vendor/firebase/10.13.1/firebase-functions.js";

export const app = initializeApp(window.__FIREBASE_CONFIG__ ?? {});
export const auth = getAuth(app);
export const db = getFirestore(app);
export const functions = getFunctions(app);

export {
  httpsCallable,
  collection, doc, getDoc, getDocs, addDoc,
  setDoc, updateDoc, deleteDoc,
  query, where, orderBy, limit, onSnapshot,
  serverTimestamp, Timestamp
};
