// public/assets/js/coaches-qa.js
import { db, FIREBASE_OPEN } from "./firebase-init.js";
import {
  collection, addDoc, getDocs, query, orderBy, serverTimestamp
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";

// If db is null (because FIREBASE_OPEN is false) keep QA null too
const QA = db ? collection(db, "coachesQA") : null;

// ---------- helpers ----------
function safeStr(v, fallback = "") {
  return (v ?? fallback).toString().trim();
}
function safeDate(ts) {
  try { return ts?.toDate?.().toLocaleString() ?? "(no timestamp)"; }
  catch { return "(no timestamp)"; }
}

// ---------- DOM ----------
const form  = document.getElementById("qa-form");
const qIn   = document.getElementById("q");
const aIn   = document.getElementById("a");
const list  = document.getElementById("qa-list");
const empty = document.getElementById("qa-empty");

// ---------- render list ----------
async function render() {
  list.innerHTML = "";

  if (!FIREBASE_OPEN) {
    // Offline mode — just show “empty” and bail
    empty.style.display = "block";
    console.log("[QA] Skipping Firestore fetch (offline mode)");
    return;
  }

  const snap = await getDocs(query(QA, orderBy("createdAt", "desc")));
  if (snap.empty) {
    empty.style.display = "block";
    return;
  }
  empty.style.display = "none";

  snap.forEach(doc => {
    const d = doc.data();
    const q = safeStr(d.question, "(no question)");
    const a = safeStr(d.answer, "");
    const t = safeDate(d.createdAt);

    const li = document.createElement("li");
    li.innerHTML = `
      <div><strong>Q:</strong> ${q}</div>
      <div><em>A:</em> ${a || "<em>(no answer yet)</em>"}</div>
      <div style="font-size:.85rem;opacity:.7;margin-top:.25rem;">${t}</div>
    `;
    list.appendChild(li);
  });
}

// ---------- add item ----------
async function addQA(question, answer) {
  if (!FIREBASE_OPEN) {
    console.log("[QA] Would add:", { question, answer });
    return;
  }
  await addDoc(QA, { question, answer, createdAt: serverTimestamp() });
}

// ---------- form wiring ----------
form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const question = safeStr(qIn.value);
  const answer   = safeStr(aIn.value);
  if (!question) { alert("Question required."); return; }

  try {
    await addQA(question, answer);
    qIn.value = ""; aIn.value = "";
    await render();
  } catch (err) {
    console.error("[QA] add error", err);
    alert("Could not add QA (check rules/console).");
  }
});

// initial paint
render().catch(err => {
  console.error("[QA] render error", err);
  empty.style.display = "block";
});
