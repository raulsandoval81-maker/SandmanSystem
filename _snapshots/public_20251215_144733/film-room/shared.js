/* ===========================================================
   Sandman · FilmRoom + Recon Shared Utilities
   Version: 0.1  (Safe skeleton)
   =========================================================== */

import { 
  db,
  doc,
  getDoc,
  setDoc,
  collection,
  addDoc,
  serverTimestamp 
} from "/assets/js/firebase-init.js";

/* -----------------------------------------------------------
   Toast system (simple + safe)
   ----------------------------------------------------------- */
export function toast(msg, type="info") {
  let box = document.getElementById("toast-box");
  if (!box) {
    box = document.createElement("div");
    box.id = "toast-box";
    box.style.position = "fixed";
    box.style.bottom = "20px";
    box.style.right = "20px";
    box.style.zIndex = "9999";
    box.style.display = "flex";
    box.style.flexDirection = "column";
    box.style.gap = "8px";
    document.body.appendChild(box);
  }

  const note = document.createElement("div");
  note.textContent = msg;
  note.style.padding = "10px 14px";
  note.style.borderRadius = "10px";
  note.style.fontSize = ".85rem";
  note.style.color = "#fff";
  note.style.boxShadow = "0 0 10px rgba(0,0,0,.3)";
  note.style.transition = ".25s";
  note.style.opacity = "0";

  if (type === "err") {
    note.style.background = "#e63946";
  } else if (type === "ok") {
    note.style.background = "#16a34a";
  } else {
    note.style.background = "#3b82f6";
  }

  box.appendChild(note);

  requestAnimationFrame(() => {
    note.style.opacity = "1";
  });

  setTimeout(() => {
    note.style.opacity = "0";
    setTimeout(() => note.remove(), 300);
  }, 3000);
}

/* -----------------------------------------------------------
   Safe Firestore wrappers
   ----------------------------------------------------------- */

export async function safeGet(path) {
  try {
    const ref = doc(db, path);
    const snap = await getDoc(ref);
    return snap.exists() ? snap.data() : null;
  } catch (err) {
    console.error("safeGet:", err);
    toast("Read error.", "err");
    return null;
  }
}

export async function safeSet(path, data) {
  try {
    const ref = doc(db, path);
    await setDoc(ref, {
      ...data,
      updatedAt: serverTimestamp()
    }, { merge:true });
    toast("Saved.", "ok");
    return true;
  } catch (err) {
    console.error("safeSet:", err);
    toast("Save failed.", "err");
    return false;
  }
}

export async function safeAdd(path, data) {
  try {
    const ref = collection(db, path);
    const out = await addDoc(ref, {
      ...data,
      createdAt: serverTimestamp()
    });
    toast("Added.", "ok");
    return out.id;
  } catch (err) {
    console.error("safeAdd:", err);
    toast("Add failed.", "err");
    return null;
  }
}

/* -----------------------------------------------------------
   Small helpers
   ----------------------------------------------------------- */

export function $(sel, root=document) {
  return root.querySelector(sel);
}
export function $all(sel, root=document) {
  return [...root.querySelectorAll(sel)];
}

export function byId(id) {
  return document.getElementById(id);
}

export function uid() {
  return "id-" + Math.random().toString(36).slice(2, 10);
}

export function isoDate() {
  return new Date().toISOString().slice(0,10);
}

/* -----------------------------------------------------------
   Navigation helpers
   ----------------------------------------------------------- */
export function go(url) {
  location.href = url;
}

/* -----------------------------------------------------------
   Future AI endpoint wrapper (placeholder)
   ----------------------------------------------------------- */

export async function aiScoutRequest(payload) {
  console.log("AI-Scout Placeholder:", payload);
  toast("AI endpoint not wired yet.", "info");
  return { summary:"AI coming soon.", tendencies:[], risks:[] };
}

/* ===========================================================
   END SHARED
   =========================================================== */
