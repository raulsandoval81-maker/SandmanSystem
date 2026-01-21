// public/assets/js/athlete-logs.js   (rename from coaches-athlete.js if you want)
import { db } from "./firebase-init.js";
import { collection, addDoc, getDocs } 
  from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";

// collection ref
const athletesCol = collection(db, "athletes");

// add a log
export async function addAthleteLog(data) {
  try { await addDoc(athletesCol, data); console.log("[Athlete] log added:", data); }
  catch (err) { console.error("[Athlete] add error:", err); }
}

// fetch logs
export async function getAthleteLogs() {
  try {
    const snap = await getDocs(athletesCol);
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (err) {
    console.error("[Athlete] fetch error:", err);
    return [];
  }
}

console.log("[Athlete] athlete-logs.js loaded");
