// comms.js — Para-Comms wired to Firestore emulator

// Firestore (CDN) — emulator-ready
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.1/firebase-app.js";
import {
  getFirestore, connectFirestoreEmulator,
  collection, addDoc, serverTimestamp,
  query, orderBy, onSnapshot
} from "https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js";

// Minimal config for local emulator
const app = initializeApp({
  apiKey: "demo",
  projectId: "sandmandashboard",
  appId: "local-demo"
});
const db = getFirestore(app);
connectFirestoreEmulator(db, "127.0.0.1", 8081);

// Month bucket: YYYYMM
const ym = (() => {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}${m}`;
})();
const col = collection(db, "comms", ym, "entries");

// Elements
const form      = document.getElementById("sendForm");
const elFrom    = document.getElementById("fromRole");
const elAudience= document.getElementById("audience");
const elEN      = document.getElementById("message_en");
const elES      = document.getElementById("message_es");
const elStatus  = document.getElementById("status");
const elLog     = document.getElementById("log");

// Guard: only wire if form exists
if (form && elLog) {
  // Submit → write to Firestore
  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const text_en = (elEN.value || "").trim();
    const text_es = (elES.value || "").trim();
    if (!text_en && !text_es) {
      return nudge("Type a message / Escriba un mensaje.");
    }

    // Mirror if one is empty so comms are always bilingual
    const en = text_en || text_es;
    const es = text_es || text_en;

    const fromRole = elFrom.value;      // "coach" | "parent"
    const audience = elAudience.value;  // "parents" | "team" | "coach"
    const toRole = audience === "parents" ? "parent"
                : audience === "coach"   ? "coach"
                : "team";

    const docData = {
      loopTag: "L4-comm",
      audience,
      fromRole,
      toRole,
      text_en: en,
      text_es: es,
      timestamp: serverTimestamp(),
      status: "sent"
    };

    try {
      await addDoc(col, docData);
      elEN.value = "";
      elES.value = "";
      nudge("Sent / Enviado.");
    } catch (err) {
      console.error(err);
      nudge("Send failed — check emulator / Falló el envío — verifique el emulador.", true);
    }
  });

  // Live log (newest first)
  const q = query(col, orderBy("timestamp", "desc"));
  onSnapshot(q, (snap) => {
    elLog.innerHTML = "";
    snap.forEach(doc => elLog.appendChild(renderCard(doc.data())));
  });
}

function nudge(msg, isErr = false) {
  if (!elStatus) return;
  elStatus.textContent = msg;
  elStatus.style.color = isErr ? "#ff6b6b" : "var(--muted)";
  setTimeout(() => {
    elStatus.textContent = "";
  }, 1800);
}

// Render message using the same structure as the local mock
function renderCard(d) {
  const div = document.createElement("div");
  div.className = "msg";

  const fromRole = (d.fromRole || "?").toString();
  const toRole   = (d.toRole   || "-").toString();
  const audience = (d.audience || "-").toString();

  div.innerHTML = `
    <div class="msg-head">
      <span>${fromLabel(fromRole)} → ${toLabel(toRole)} (${audienceLabel(audience)})</span>
      <span>${formatTime(d.timestamp)}</span>
    </div>
    <div class="msg-body">
      <div class="msg-lang"><strong>EN:</strong> ${escapeHtml(d.text_en || "")}</div>
      <div class="msg-lang"><strong>ES:</strong> ${escapeHtml(d.text_es || "")}</div>
    </div>
  `;
  return div;
}

function fromLabel(v) {
  return v === "parent" ? "Parent" : "Coach";
}

function toLabel(v) {
  if (v === "parent") return "Parents";
  if (v === "coach")  return "Coaches";
  if (v === "team")   return "Team";
  return v;
}

function audienceLabel(v) {
  if (v === "team")   return "Team";
  if (v === "coach")  return "Coaches";
  if (v === "parents")return "Parents";
  return v;
}

function formatTime(ts) {
  if (!ts || !ts.toDate) return "";
  const d = ts.toDate();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd} ${hh}:${mi}`;
}

function escapeHtml(str) {
  return str
    .replace(/&/g,  "&amp;")
    .replace(/</g,  "&lt;")
    .replace(/>/g,  "&gt;")
    .replace(/"/g,  "&quot;")
    .replace(/'/g,  "&#39;");
}
