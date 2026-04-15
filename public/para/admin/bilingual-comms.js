// ---------------------------------------------------------
// Para-Comms — Bilingual Bulletin Builder
// Final clean version
// - EN / ES builder
// - Local draft save
// - Preview before translate apply
// - Copy EN / ES / Both
// - Post to paraAnnouncements
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
const subjectEl = document.getElementById("pc-subject");
const enEl = document.getElementById("pc-en");
const esEl = document.getElementById("pc-es");

const previewBox = document.getElementById("preview");
const previewText = document.getElementById("preview-text");
const previewConfidence = document.getElementById("preview-confidence");
const previewApply = document.getElementById("preview-apply");
const previewCancel = document.getElementById("preview-cancel");

const btnPostBulletin = document.getElementById("btn-post-bulletin");
const btnEnToEs = document.getElementById("btn-en-to-es");
const btnEsToEn = document.getElementById("btn-es-to-en");
const btnCopyEn = document.getElementById("btn-copy-en");
const btnCopyEs = document.getElementById("btn-copy-es");
const btnCopyBoth = document.getElementById("btn-copy-both");

let pendingTarget = null;

// ---------------------------------------------------------
// DRAFTS
// ---------------------------------------------------------
function saveDrafts() {
  localStorage.setItem("pc-subject", subjectEl?.value || "");
  localStorage.setItem("pc-en", enEl?.value || "");
  localStorage.setItem("pc-es", esEl?.value || "");
}

function loadDrafts() {
  if (subjectEl) subjectEl.value = localStorage.getItem("pc-subject") || "";
  if (enEl) enEl.value = localStorage.getItem("pc-en") || "";
  if (esEl) esEl.value = localStorage.getItem("pc-es") || "";
}

document.addEventListener("DOMContentLoaded", loadDrafts);
subjectEl?.addEventListener("input", saveDrafts);
enEl?.addEventListener("input", saveDrafts);
esEl?.addEventListener("input", saveDrafts);

// ---------------------------------------------------------
// TRANSLATION MAPS
// ---------------------------------------------------------
const EN_TO_ES = {
  "practice": "práctica",
  "time": "hora",
  "change": "cambio",
  "tomorrow": "mañana",
  "today": "hoy",
  "team": "equipo",
  "parents": "padres",
  "bus": "autobús",
  "coach": "entrenador",
  "water": "agua"
};

const ES_TO_EN = {
  "práctica": "practice",
  "hora": "time",
  "cambio": "change",
  "mañana": "tomorrow",
  "hoy": "today",
  "equipo": "team",
  "padres": "parents",
  "autobús": "bus",
  "entrenador": "coach",
  "agua": "water"
};

function translateWithMap(text, map, confidence = "Quick") {
  let out = String(text || "").toLowerCase().trim();

  Object.entries(map).forEach(([from, to]) => {
    out = out.replaceAll(from, to);
  });

  out = out ? out.charAt(0).toUpperCase() + out.slice(1) : "";
  return { result: out, confidence };
}

async function translateENtoES(text) {
  return translateWithMap(text, EN_TO_ES, "Quick");
}

async function translateEStoEN(text) {
  return translateWithMap(text, ES_TO_EN, "Quick");
}

// ---------------------------------------------------------
// PREVIEW
// ---------------------------------------------------------
async function handleTranslate(target) {
  pendingTarget = target;

  const sourceText = target === "es"
    ? (enEl?.value || "")
    : (esEl?.value || "");

  const { result, confidence } = target === "es"
    ? await translateENtoES(sourceText)
    : await translateEStoEN(sourceText);

  if (previewText) previewText.textContent = result || "(No text)";
  if (previewConfidence) {
    previewConfidence.textContent = result ? `Confidence: ${confidence}` : "";
  }
  if (previewBox) previewBox.style.display = "flex";
}

previewApply?.addEventListener("click", () => {
  const text = previewText?.textContent || "";

  if (pendingTarget === "es" && esEl) esEl.value = text;
  if (pendingTarget === "en" && enEl) enEl.value = text;

  if (previewBox) previewBox.style.display = "none";
  saveDrafts();
});

previewCancel?.addEventListener("click", () => {
  if (previewBox) previewBox.style.display = "none";
});

// ---------------------------------------------------------
// COPY
// ---------------------------------------------------------
async function copyText(text) {
  const value = String(text || "").trim();
  if (!value) {
    alert("Nothing to copy.");
    return;
  }

  try {
    await navigator.clipboard.writeText(value);
    alert("Copied.");
  } catch (err) {
    console.error(err);
    alert("Copy failed.");
  }
}

function buildCombinedCopy() {
  return `🏋🏽‍♂️ Lompoc Wrestling Update
—————————————
📌 Subject: ${subjectEl?.value || ""}

🇺🇸 English:
${enEl?.value || ""}

🇪🇸 Español:
${esEl?.value || ""}
`;
}

btnCopyEn?.addEventListener("click", () => copyText(enEl?.value || ""));
btnCopyEs?.addEventListener("click", () => copyText(esEl?.value || ""));
btnCopyBoth?.addEventListener("click", () => copyText(buildCombinedCopy()));

// ---------------------------------------------------------
// POST TO ANNOUNCEMENTS
// Writes to: paraAnnouncements
// ---------------------------------------------------------
const announcementsCol = collection(db, "paraAnnouncements");

async function postToBulletin() {
  const subject = (subjectEl?.value || "").trim();
  const enText = (enEl?.value || "").trim();
  const esText = (esEl?.value || "").trim();

  if (!subject || (!enText && !esText)) {
    alert("Need a subject and at least one language.");
    return;
  }

  if (btnPostBulletin) {
    btnPostBulletin.disabled = true;
    btnPostBulletin.dataset.oldText = btnPostBulletin.textContent || "";
    btnPostBulletin.textContent = "Posting...";
  }

  try {
    const message =
      enText && esText
        ? `EN:\n${enText}\n\nES:\n${esText}`
        : (enText || esText);

    await addDoc(announcementsCol, {
      title: subject,
      subject,
      message,
      en: enText,
      es: esText,
      pinned: false,
      createdAt: serverTimestamp(),
      from: "coach",
      fromName: "Coach"
    });

    alert("Posted to Announcements.");
  } catch (err) {
    console.error(err);
    alert("Error posting — check console.");
  } finally {
    if (btnPostBulletin) {
      btnPostBulletin.disabled = false;
      btnPostBulletin.textContent = btnPostBulletin.dataset.oldText || "Post";
      delete btnPostBulletin.dataset.oldText;
    }
  }
}

btnPostBulletin?.addEventListener("click", postToBulletin);

// ---------------------------------------------------------
// TRANSLATE BUTTONS
// ---------------------------------------------------------
btnEnToEs?.addEventListener("click", () => handleTranslate("es"));
btnEsToEn?.addEventListener("click", () => handleTranslate("en"));