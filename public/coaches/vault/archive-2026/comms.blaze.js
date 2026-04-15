// ---------------------------------------------------------
//  Para-Comms Blaze Edition (Final)
//  - No language toggle
//  - Drafts saved
//  - Translate EN ↔ ES with preview
//  - Copy EN / Copy ES / Copy Both
//  - Post to Announcements (HS PARA PILOT)
// ---------------------------------------------------------

// ---------------------------------------------------------
// FIREBASE INIT  (must be at the top, unified!)
// ---------------------------------------------------------
import { initializeApp } 
  from "https://www.gstatic.com/firebasejs/10.13.1/firebase-app.js";

import { 
  getFirestore,
  collection,
  addDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyXXXXX",
  authDomain: "yourproject.firebaseapp.com",
  projectId: "yourproject",
  storageBucket: "yourproject.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abcdef123456",
};

const app = initializeApp(firebaseConfig);
const db  = getFirestore(app);

// ---------------------------------------------------------
// ELEMENTS
// ---------------------------------------------------------
const subjectEl = document.getElementById("pc-subject");
const enEl      = document.getElementById("pc-en");
const esEl      = document.getElementById("pc-es");

const previewBox        = document.getElementById("preview");
const previewText       = document.getElementById("preview-text");
const previewConfidence = document.getElementById("preview-confidence");
const previewApply      = document.getElementById("preview-apply");
const previewCancel     = document.getElementById("preview-cancel");

let pendingTarget = null;

// ---------------------------------------------------------
// DRAFTS
// ---------------------------------------------------------
function saveDrafts() {
  localStorage.setItem("pc-subject", subjectEl.value);
  localStorage.setItem("pc-en", enEl.value);
  localStorage.setItem("pc-es", esEl.value);
}

function loadDrafts() {
  subjectEl.value = localStorage.getItem("pc-subject") || "";
  enEl.value      = localStorage.getItem("pc-en")      || "";
  esEl.value      = localStorage.getItem("pc-es")      || "";
}

document.addEventListener("DOMContentLoaded", loadDrafts);
subjectEl.addEventListener("input", saveDrafts);
enEl.addEventListener("input", saveDrafts);
esEl.addEventListener("input", saveDrafts);

// ---------------------------------------------------------
// MANUAL TRANSLATOR
// ---------------------------------------------------------
async function translateENtoES(text) {
  const map = {
    "practice": "práctica",
    "time": "hora",
    "change": "cambio",
    "tomorrow": "mañana",
    "today": "hoy",
    "team": "equipo",
    "parents": "padres",
    "water": "agua",
    "coach": "entrenador",
  };

  let out = text.toLowerCase();
  Object.entries(map).forEach(([en, es]) => {
    out = out.replaceAll(en, es);
  });

  out = out.charAt(0).toUpperCase() + out.slice(1);
  return { result: out, confidence: "High" };
}

async function translateEStoEN(text) {
  const map = {
    "práctica": "practice",
    "hora": "time",
    "cambio": "change",
    "mañana": "tomorrow",
    "hoy": "today",
    "equipo": "team",
    "padres": "parents",
    "agua": "water",
    "entrenador": "coach",
  };

  let out = text.toLowerCase();
  Object.entries(map).forEach(([es, en]) => {
    out = out.replaceAll(es, en);
  });

  out = out.charAt(0).toUpperCase() + out.slice(1);
  return { result: out, confidence: "Medium" };
}

// ---------------------------------------------------------
// PREVIEW HANDLER
// ---------------------------------------------------------
async function handleTranslate(target) {
  pendingTarget = target;

  const text = target === "es" ? enEl.value : esEl.value;

  const { result, confidence } =
    target === "es"
      ? await translateENtoES(text)
      : await translateEStoEN(text);

  previewText.textContent        = result;
  previewConfidence.textContent  = `Confidence: ${confidence}`;
  previewBox.style.display       = "flex";
}

previewApply.addEventListener("click", () => {
  if (pendingTarget === "es") esEl.value = previewText.textContent;
  if (pendingTarget === "en") enEl.value = previewText.textContent;

  previewBox.style.display = "none";
  saveDrafts();
});

previewCancel.addEventListener("click", () => {
  previewBox.style.display = "none";
});

// ---------------------------------------------------------
// COPY HELPERS
// ---------------------------------------------------------
function copyText(t) {
  navigator.clipboard.writeText(t);
  alert("Copied!");
}

function copyBoth() {
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

// ---------------------------------------------------------
// POST TO BULLETIN  (Coach → Parent Announcements)
// ---------------------------------------------------------

// Month bucket (YYYY-MM)
const monthKey = (() => {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
})();

const bulletinCollection = collection(db, "para-bulletin", monthKey, "entries");

async function postToBulletin() {
  const subject = subjectEl.value.trim();
  const enText  = enEl.value.trim();
  const esText  = esEl.value.trim();

  if (!subject || (!enText && !esText)) {
    alert("Need a subject and at least one language.");
    return;
  }

  try {
    await addDoc(bulletinCollection, {
      subject,
      en: enText,
      es: esText,
      fromRole: "coach",
      timestamp: serverTimestamp()
    });

    alert("Posted to Announcements.");
  } catch (err) {
    console.error(err);
    alert("Error posting. Check the emulator or config.");
  }
}

// ---------------------------------------------------------
// BIND BUTTONS
// ---------------------------------------------------------
document.getElementById("btn-post-bulletin")
  .addEventListener("click", postToBulletin);

document.getElementById("btn-en-to-es")
  .addEventListener("click", () => handleTranslate("es"));

document.getElementById("btn-es-to-en")
  .addEventListener("click", () => handleTranslate("en"));

document.getElementById("btn-copy-en")
  .addEventListener("click", () => copyText(enEl.value));

document.getElementById("btn-copy-es")
  .addEventListener("click", () => copyText(esEl.value));

document.getElementById("btn-copy-both")
  .addEventListener("click", copyBoth);
