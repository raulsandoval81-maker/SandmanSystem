// ---------------------------------------------------------
// Para-Comms (HS Parent Edition)
// - EN/ES bilingual message builder
// - Drafts saved locally
// - Translate EN ↔ ES with preview modal
// - Copy EN / Copy ES / Copy Both
// - Post to Announcements (para-bulletin)
// ---------------------------------------------------------

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.1/firebase-app.js";
import {
  getFirestore,
  collection,
  addDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js";

// ---------------------------------------------------------
// 🔥 Firebase Init (use your real config)
// ---------------------------------------------------------
const firebaseConfig = {
  apiKey: "YOUR_KEY",
  authDomain: "yourproject.firebaseapp.com",
  projectId: "yourproject",
  storageBucket: "yourproject.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abcdef123456"
};

const app = initializeApp(firebaseConfig);
const db  = getFirestore(app);

// ---------------------------------------------------------
// DOM
// ---------------------------------------------------------
const subjectEl   = document.getElementById("pc-subject");
const enEl        = document.getElementById("pc-en");
const esEl        = document.getElementById("pc-es");

const previewBox        = document.getElementById("preview");
const previewText       = document.getElementById("preview-text");
const previewConfidence = document.getElementById("preview-confidence");
const previewApply      = document.getElementById("preview-apply");
const previewCancel     = document.getElementById("preview-cancel");

let pendingTarget = null;

// ---------------------------------------------------------
// Draft Save / Load
// ---------------------------------------------------------
function saveDrafts(){
  localStorage.setItem("pc-subject", subjectEl.value);
  localStorage.setItem("pc-en",      enEl.value);
  localStorage.setItem("pc-es",      esEl.value);
}

function loadDrafts(){
  subjectEl.value = localStorage.getItem("pc-subject") || "";
  enEl.value      = localStorage.getItem("pc-en")      || "";
  esEl.value      = localStorage.getItem("pc-es")      || "";
}

document.addEventListener("DOMContentLoaded", loadDrafts);
subjectEl.addEventListener("input", saveDrafts);
enEl.addEventListener("input", saveDrafts);
esEl.addEventListener("input", saveDrafts);

// ---------------------------------------------------------
// Simple Dictionary Translator
// ---------------------------------------------------------
async function translateENtoES(text){
  const map = {
    "practice":"práctica",
    "time":"hora",
    "change":"cambio",
    "tomorrow":"mañana",
    "today":"hoy",
    "team":"equipo",
    "parents":"padres",
    "bus":"autobús",
    "coach":"entrenador",
    "water":"agua"
  };

  let out = text.toLowerCase();
  Object.entries(map).forEach(([en, es])=>{
    out = out.replaceAll(en, es);
  });

  out = out.charAt(0).toUpperCase() + out.slice(1);
  return { result: out, confidence:"High" };
}

async function translateEStoEN(text){
  const map = {
    "práctica":"practice",
    "hora":"time",
    "cambio":"change",
    "mañana":"tomorrow",
    "hoy":"today",
    "equipo":"team",
    "padres":"parents",
    "autobús":"bus",
    "entrenador":"coach",
    "agua":"water"
  };

  let out = text.toLowerCase();
  Object.entries(map).forEach(([es, en])=>{
    out = out.replaceAll(es, en);
  });

  out = out.charAt(0).toUpperCase() + out.slice(1);
  return { result: out, confidence:"Medium" };
}

// ---------------------------------------------------------
// Translation Preview Handler
// ---------------------------------------------------------
async function handleTranslate(target){
  pendingTarget = target;

  const text = target === "es" ? enEl.value : esEl.value;

  const { result, confidence } =
    target === "es"
      ? await translateENtoES(text)
      : await translateEStoEN(text);

  previewText.textContent       = result || "(No text)";
  previewConfidence.textContent = result ? `Confidence: ${confidence}` : "";
  previewBox.style.display      = "flex";
}

previewApply.addEventListener("click", ()=>{
  if (pendingTarget === "es") esEl.value = previewText.textContent;
  if (pendingTarget === "en") enEl.value = previewText.textContent;
  previewBox.style.display = "none";
  saveDrafts();
});

previewCancel.addEventListener("click", ()=>{
  previewBox.style.display = "none";
});

// ---------------------------------------------------------
// Copy Helpers
// ---------------------------------------------------------
function copyText(t){
  if (!t.trim()) return alert("Nothing to copy!");
  navigator.clipboard.writeText(t);
  alert("Copied!");
}

function copyBoth(){
  const block =
`🏋🏽‍♂️ Lompoc Wrestling Update
—————————————
📌 Subject: ${subjectEl.value}

🇺🇸 English:
${enEl.value}

🇪🇸 Español:
${esEl.value}
`;
  copyText(block);
}

// Bind copy buttons
document.getElementById("btn-copy-en")
  .addEventListener("click", ()=>copyText(enEl.value));

document.getElementById("btn-copy-es")
  .addEventListener("click", ()=>copyText(esEl.value));

document.getElementById("btn-copy-both")
  .addEventListener("click", copyBoth);

// ---------------------------------------------------------
// Post to Announcements (A → B)
// ---------------------------------------------------------

// Monthly bucket (YYYY-MM)
const monthKey = (() => {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth()+1).padStart(2,"0");
  return `${y}-${m}`;
})();

const bulletinCollection = collection(db, "para-bulletin", monthKey, "entries");

async function postToBulletin(){
  const subject = subjectEl.value.trim();
  const enText  = enEl.value.trim();
  const esText  = esEl.value.trim();

  if (!subject || (!enText && !esText)){
    alert("Need a subject and at least one language.");
    return;
  }

  try{
    await addDoc(bulletinCollection, {
      subject,
      en: enText,
      es: esText,
      timestamp: serverTimestamp(),
      fromRole: "coach"
    });

    alert("Posted to Announcements.");
  } catch(err){
    console.error(err);
    alert("Error posting — check config/emulator.");
  }
}

document.getElementById("btn-post-bulletin")
  .addEventListener("click", postToBulletin);

// ---------------------------------------------------------
// Bind Translate Buttons
// ---------------------------------------------------------
document.getElementById("btn-en-to-es")
  .addEventListener("click", ()=>handleTranslate("es"));

document.getElementById("btn-es-to-en")
  .addEventListener("click", ()=>handleTranslate("en"));
