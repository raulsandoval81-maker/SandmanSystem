// ---------------------------------------------------------
// Para-Comms (HS Parent Edition) — Bulletin Builder (PILOT)
// - EN/ES message builder
// - Drafts saved locally
// - Quick EN ↔ ES swap (dictionary-based) with preview modal
// - Copy EN / Copy ES / Copy Both
// - Post to Announcements (Para lane)
// ---------------------------------------------------------

import {
  db,
  collection,
  addDoc,
  serverTimestamp
} from "/assets/js/firebase-init-para.js";

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

const btnPostBulletin = document.getElementById("btn-post-bulletin");

let pendingTarget = null;

// ---------------------------------------------------------
// Draft Save / Load
// ---------------------------------------------------------
function saveDrafts(){
  localStorage.setItem("pc-subject", subjectEl?.value || "");
  localStorage.setItem("pc-en",      enEl?.value || "");
  localStorage.setItem("pc-es",      esEl?.value || "");
}

function loadDrafts(){
  if (subjectEl) subjectEl.value = localStorage.getItem("pc-subject") || "";
  if (enEl)      enEl.value      = localStorage.getItem("pc-en")      || "";
  if (esEl)      esEl.value      = localStorage.getItem("pc-es")      || "";
}

document.addEventListener("DOMContentLoaded", loadDrafts);
subjectEl?.addEventListener("input", saveDrafts);
enEl?.addEventListener("input", saveDrafts);
esEl?.addEventListener("input", saveDrafts);

// ---------------------------------------------------------
// Quick Dictionary Translator (PILOT ONLY)
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

  let out = String(text || "").toLowerCase();
  Object.entries(map).forEach(([en, es])=>{
    out = out.replaceAll(en, es);
  });

  out = out ? out.charAt(0).toUpperCase() + out.slice(1) : "";
  return { result: out, confidence:"Quick" };
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

  let out = String(text || "").toLowerCase();
  Object.entries(map).forEach(([es, en])=>{
    out = out.replaceAll(es, en);
  });

  out = out ? out.charAt(0).toUpperCase() + out.slice(1) : "";
  return { result: out, confidence:"Quick" };
}

// ---------------------------------------------------------
// Translation Preview Handler
// ---------------------------------------------------------
async function handleTranslate(target){
  pendingTarget = target;

  const text = target === "es" ? (enEl?.value || "") : (esEl?.value || "");

  const { result, confidence } =
    target === "es"
      ? await translateENtoES(text)
      : await translateEStoEN(text);

  if (previewText)       previewText.textContent = result || "(No text)";
  if (previewConfidence) previewConfidence.textContent = result ? `Confidence: ${confidence}` : "";
  if (previewBox)        previewBox.style.display = "flex";
}

previewApply?.addEventListener("click", ()=>{
  if (pendingTarget === "es" && esEl) esEl.value = previewText?.textContent || "";
  if (pendingTarget === "en" && enEl) enEl.value = previewText?.textContent || "";
  if (previewBox) previewBox.style.display = "none";
  saveDrafts();
});

previewCancel?.addEventListener("click", ()=>{
  if (previewBox) previewBox.style.display = "none";
});

// ---------------------------------------------------------
// Copy Helpers
// ---------------------------------------------------------
function copyText(t){
  const val = String(t || "");
  if (!val.trim()) return alert("Nothing to copy!");
  navigator.clipboard.writeText(val);
  alert("Copied!");
}

function copyBoth(){
  const block =
`🏋🏽‍♂️ Lompoc Wrestling Update
—————————————
📌 Subject: ${subjectEl?.value || ""}

🇺🇸 English:
${enEl?.value || ""}

🇪🇸 Español:
${esEl?.value || ""}
`;
  copyText(block);
}

document.getElementById("btn-copy-en")
  ?.addEventListener("click", ()=>copyText(enEl?.value || ""));

document.getElementById("btn-copy-es")
  ?.addEventListener("click", ()=>copyText(esEl?.value || ""));

document.getElementById("btn-copy-both")
  ?.addEventListener("click", copyBoth);

// ---------------------------------------------------------
// Post to Announcements (Para lane)
// Writes to: paraAnnouncements
// ---------------------------------------------------------
const announcementsCol = collection(db, "paraAnnouncements");

async function postToBulletin(){
  const subject = (subjectEl?.value || "").trim();
  const enText  = (enEl?.value || "").trim();
  const esText  = (esEl?.value || "").trim();

  if (!subject || (!enText && !esText)){
    alert("Need a subject and at least one language.");
    return;
  }

  // Prevent double posts
  if (btnPostBulletin) {
    btnPostBulletin.disabled = true;
    btnPostBulletin.dataset._old = btnPostBulletin.textContent || "";
    btnPostBulletin.textContent = "Posting...";
  }

  try{
    // Store both languages in the doc for later rendering choices.
    // Keep legacy 'title' + 'message' so existing feeds can show something.
    const title = subject;
    const message =
      enText && esText
        ? `EN:\n${enText}\n\nES:\n${esText}`
        : (enText || esText);

    await addDoc(announcementsCol, {
      title,
      message,
      en: enText,
      es: esText,
      pinned: false,
      createdAt: serverTimestamp(),
      from: "coach",
      fromName: "Coach"
    });

    alert("Posted to Announcements.");
  } catch(err){
    console.error(err);
    alert("Error posting — check console.");
  } finally {
    if (btnPostBulletin) {
      btnPostBulletin.disabled = false;
      btnPostBulletin.textContent = btnPostBulletin.dataset._old || "Post";
      delete btnPostBulletin.dataset._old;
    }
  }
}

btnPostBulletin?.addEventListener("click", postToBulletin);

// ---------------------------------------------------------
// Bind Translate Buttons
// ---------------------------------------------------------
document.getElementById("btn-en-to-es")
  ?.addEventListener("click", ()=>handleTranslate("es"));

document.getElementById("btn-es-to-en")
  ?.addEventListener("click", ()=>handleTranslate("en"));