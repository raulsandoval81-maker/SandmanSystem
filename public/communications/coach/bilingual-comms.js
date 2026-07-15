// ---------------------------------------------------------
// Para-Comms — Bilingual Bulletin Builder
//
// Features:
// - English / Spanish message builder
// - Local draft save
// - Translation preview before applying
// - Copy English / Spanish / both
// - Discipline-aware announcement posting
//
// Announcement targeting:
// audienceType:
//   all | parents | athletes
//
// scope:
//   all | discipline
//
// discipline:
//   wrestling | boxing | kickboxing |
//   mma | submission-grappling
// ---------------------------------------------------------

import {
  db,
  ensureSignedIn,
  collection,
  addDoc,
  serverTimestamp
} from "/assets/js/firebase-init-para.js";

await ensureSignedIn();

/* =========================
   CONFIG
========================= */

const TEAM_ID = "law";

const DRAFT_KEYS = {
  subject: "pc-subject",
  english: "pc-en",
  spanish: "pc-es",
  audience: "pc-audience-type",
  scope: "pc-scope",
  discipline: "pc-discipline"
};

/* =========================
   DOM
========================= */

const subjectEl =
  document.getElementById("pc-subject");

const enEl =
  document.getElementById("pc-en");

const esEl =
  document.getElementById("pc-es");

const audienceTypeEl =
  document.getElementById(
    "pc-audience-type"
  );

const scopeEl =
  document.getElementById(
    "pc-scope"
  );

const disciplineEl =
  document.getElementById(
    "pc-discipline"
  );

const statusEl =
  document.getElementById(
    "pc-status"
  );

const previewBox =
  document.getElementById(
    "preview"
  );

const previewText =
  document.getElementById(
    "preview-text"
  );

const previewConfidence =
  document.getElementById(
    "preview-confidence"
  );

const previewApply =
  document.getElementById(
    "preview-apply"
  );

const previewCancel =
  document.getElementById(
    "preview-cancel"
  );

const btnPostBulletin =
  document.getElementById(
    "btn-post-bulletin"
  );

const btnEnToEs =
  document.getElementById(
    "btn-en-to-es"
  );

const btnEsToEn =
  document.getElementById(
    "btn-es-to-en"
  );

const btnCopyEn =
  document.getElementById(
    "btn-copy-en"
  );

const btnCopyEs =
  document.getElementById(
    "btn-copy-es"
  );

const btnCopyBoth =
  document.getElementById(
    "btn-copy-both"
  );

let pendingTarget = null;

/* =========================
   HELPERS
========================= */

function setStatus(
  message = "",
  isError = false
) {
  if (!statusEl) return;

  statusEl.textContent =
    message;

  statusEl.style.color =
    isError
      ? "#fecaca"
      : "#ffdd48";
}

function normalizeDiscipline(
  value = ""
) {
  const raw =
    String(value || "")
      .trim()
      .toLowerCase();

  if (raw.includes("kickbox")) {
    return "kickboxing";
  }

  if (raw.includes("wrest")) {
    return "wrestling";
  }

  if (
    raw === "mma" ||
    raw.includes("mixed martial")
  ) {
    return "mma";
  }

  if (
    raw.includes("submission") ||
    raw.includes("grappling")
  ) {
    return "submission-grappling";
  }

  if (raw.includes("box")) {
    return "boxing";
  }

  return raw;
}

function disciplineLabel(
  value = ""
) {
  const labels = {
    wrestling: "Wrestling",
    boxing: "Boxing",
    kickboxing: "Kickboxing",
    mma: "MMA",
    "submission-grappling":
      "Submission Grappling"
  };

  const normalized =
    normalizeDiscipline(value);

  return (
    labels[normalized] ||
    "All Disciplines"
  );
}

function audienceLabel(
  value = "all"
) {
  const normalized =
    String(value || "all")
      .trim()
      .toLowerCase();

  if (normalized === "parents") {
    return "Parents";
  }

  if (normalized === "athletes") {
    return "Athletes";
  }

  return "Athletes + Parents";
}

function syncScopeControls() {
  if (
    !scopeEl ||
    !disciplineEl
  ) {
    return;
  }

  const disciplineScoped =
    scopeEl.value === "discipline";

  disciplineEl.disabled =
    !disciplineScoped;

  if (!disciplineScoped) {
    disciplineEl.value = "";
  }

  saveDrafts();
}

/* =========================
   DRAFTS
========================= */

function saveDrafts() {
  localStorage.setItem(
    DRAFT_KEYS.subject,
    subjectEl?.value || ""
  );

  localStorage.setItem(
    DRAFT_KEYS.english,
    enEl?.value || ""
  );

  localStorage.setItem(
    DRAFT_KEYS.spanish,
    esEl?.value || ""
  );

  localStorage.setItem(
    DRAFT_KEYS.audience,
    audienceTypeEl?.value || "all"
  );

  localStorage.setItem(
    DRAFT_KEYS.scope,
    scopeEl?.value || "all"
  );

  localStorage.setItem(
    DRAFT_KEYS.discipline,
    disciplineEl?.value || ""
  );
}

function loadDrafts() {
  if (subjectEl) {
    subjectEl.value =
      localStorage.getItem(
        DRAFT_KEYS.subject
      ) || "";
  }

  if (enEl) {
    enEl.value =
      localStorage.getItem(
        DRAFT_KEYS.english
      ) || "";
  }

  if (esEl) {
    esEl.value =
      localStorage.getItem(
        DRAFT_KEYS.spanish
      ) || "";
  }

  if (audienceTypeEl) {
    audienceTypeEl.value =
      localStorage.getItem(
        DRAFT_KEYS.audience
      ) || "all";
  }

  if (scopeEl) {
    scopeEl.value =
      localStorage.getItem(
        DRAFT_KEYS.scope
      ) || "all";
  }

  if (disciplineEl) {
    disciplineEl.value =
      localStorage.getItem(
        DRAFT_KEYS.discipline
      ) || "";
  }

  syncScopeControls();
}

function clearDrafts() {
  Object.values(
    DRAFT_KEYS
  ).forEach((key) => {
    localStorage.removeItem(key);
  });
}

document.addEventListener(
  "DOMContentLoaded",
  loadDrafts
);

subjectEl?.addEventListener(
  "input",
  saveDrafts
);

enEl?.addEventListener(
  "input",
  saveDrafts
);

esEl?.addEventListener(
  "input",
  saveDrafts
);

audienceTypeEl?.addEventListener(
  "change",
  saveDrafts
);

scopeEl?.addEventListener(
  "change",
  syncScopeControls
);

disciplineEl?.addEventListener(
  "change",
  saveDrafts
);

/* =========================
   TRANSLATION MAPS
========================= */

const EN_TO_ES = {
  practice: "práctica",
  time: "hora",
  change: "cambio",
  tomorrow: "mañana",
  today: "hoy",
  team: "equipo",
  parents: "padres",
  athletes: "atletas",
  bus: "autobús",
  coach: "entrenador",
  water: "agua",
  wrestling: "lucha",
  boxing: "boxeo",
  kickboxing: "kickboxing",
  tournament: "torneo",
  schedule: "horario"
};

const ES_TO_EN = {
  práctica: "practice",
  hora: "time",
  cambio: "change",
  mañana: "tomorrow",
  hoy: "today",
  equipo: "team",
  padres: "parents",
  atletas: "athletes",
  autobús: "bus",
  entrenador: "coach",
  agua: "water",
  lucha: "wrestling",
  boxeo: "boxing",
  torneo: "tournament",
  horario: "schedule"
};

function replaceWholeWords(
  text,
  map
) {
  let output =
    String(text || "");

  Object.entries(map)
    .sort(
      ([a], [b]) =>
        b.length - a.length
    )
    .forEach(([from, to]) => {
      const escaped =
        from.replace(
          /[.*+?^${}()|[\]\\]/g,
          "\\$&"
        );

      const pattern =
        new RegExp(
          `\\b${escaped}\\b`,
          "gi"
        );

      output =
        output.replace(
          pattern,
          to
        );
    });

  return output.trim();
}

function translateWithMap(
  text,
  map,
  confidence = "Quick glossary"
) {
  return {
    result:
      replaceWholeWords(
        text,
        map
      ),

    confidence
  };
}

async function translateENtoES(
  text
) {
  return translateWithMap(
    text,
    EN_TO_ES
  );
}

async function translateEStoEN(
  text
) {
  return translateWithMap(
    text,
    ES_TO_EN
  );
}

/* =========================
   PREVIEW
========================= */

async function handleTranslate(
  target
) {
  pendingTarget = target;

  const sourceText =
    target === "es"
      ? enEl?.value || ""
      : esEl?.value || "";

  if (!sourceText.trim()) {
    alert(
      "Enter source text first."
    );

    return;
  }

  const {
    result,
    confidence
  } =
    target === "es"
      ? await translateENtoES(
          sourceText
        )
      : await translateEStoEN(
          sourceText
        );

  if (previewText) {
    previewText.textContent =
      result || "(No text)";
  }

  if (previewConfidence) {
    previewConfidence.textContent =
      result
        ? `Translation mode: ${confidence}`
        : "";
  }

  if (previewBox) {
    previewBox.style.display =
      "flex";
  }
}

previewApply?.addEventListener(
  "click",
  () => {
    const text =
      previewText?.textContent ||
      "";

    if (
      pendingTarget === "es" &&
      esEl
    ) {
      esEl.value = text;
    }

    if (
      pendingTarget === "en" &&
      enEl
    ) {
      enEl.value = text;
    }

    if (previewBox) {
      previewBox.style.display =
        "none";
    }

    pendingTarget = null;
    saveDrafts();
  }
);

previewCancel?.addEventListener(
  "click",
  () => {
    if (previewBox) {
      previewBox.style.display =
        "none";
    }

    pendingTarget = null;
  }
);

/* =========================
   COPY
========================= */

async function copyText(text) {
  const value =
    String(text || "").trim();

  if (!value) {
    alert("Nothing to copy.");
    return;
  }

  try {
    await navigator.clipboard.writeText(
      value
    );

    setStatus("Copied.");

    setTimeout(
      () => setStatus(""),
      1200
    );
  } catch (error) {
    console.error(
      "[bilingual-builder] copy failed:",
      error
    );

    alert("Copy failed.");
  }
}

function buildCombinedCopy() {
  const subject =
    subjectEl?.value || "";

  const english =
    enEl?.value || "";

  const spanish =
    esEl?.value || "";

  const scope =
    scopeEl?.value === "discipline"
      ? disciplineLabel(
          disciplineEl?.value
        )
      : "All Disciplines";

  const audience =
    audienceLabel(
      audienceTypeEl?.value
    );

  return `
🥊 Sandman Combat™ Update
—————————————
📌 Subject: ${subject}
👥 Audience: ${audience}
🎯 Scope: ${scope}

🇺🇸 English:
${english}

🇪🇸 Español:
${spanish}
  `.trim();
}

btnCopyEn?.addEventListener(
  "click",
  () => {
    copyText(
      enEl?.value || ""
    );
  }
);

btnCopyEs?.addEventListener(
  "click",
  () => {
    copyText(
      esEl?.value || ""
    );
  }
);

btnCopyBoth?.addEventListener(
  "click",
  () => {
    copyText(
      buildCombinedCopy()
    );
  }
);

/* =========================
   POST ANNOUNCEMENT
========================= */

const announcementsCol =
  collection(
    db,
    "paraAnnouncements"
  );

async function postToBulletin() {
  const subject =
    String(
      subjectEl?.value || ""
    ).trim();

  const enText =
    String(
      enEl?.value || ""
    ).trim();

  const esText =
    String(
      esEl?.value || ""
    ).trim();

  const audienceType =
    String(
      audienceTypeEl?.value ||
      "all"
    )
      .trim()
      .toLowerCase();

  const scope =
    String(
      scopeEl?.value || "all"
    )
      .trim()
      .toLowerCase();

  const discipline =
    scope === "discipline"
      ? normalizeDiscipline(
          disciplineEl?.value ||
          ""
        )
      : "";

  if (
    !subject ||
    (!enText && !esText)
  ) {
    alert(
      "Enter a subject and at least one language."
    );

    return;
  }

  if (
    scope === "discipline" &&
    !discipline
  ) {
    alert(
      "Select a discipline."
    );

    return;
  }

  if (btnPostBulletin) {
    btnPostBulletin.disabled =
      true;

    btnPostBulletin.dataset.oldText =
      btnPostBulletin.textContent ||
      "";

    btnPostBulletin.textContent =
      "Posting...";
  }

  setStatus(
    "Posting announcement..."
  );

  try {
    const message =
      enText && esText
        ? `EN:\n${enText}\n\nES:\n${esText}`
        : enText || esText;

    await addDoc(
      announcementsCol,
      {
        teamId: TEAM_ID,

        category:
          "Bilingual Update",

        title: subject,
        subject,
        message,

        en: enText,
        es: esText,

        audienceType,
        scope,
        discipline,

        pinned: false,
        archived: false,
        deleted: false,

        createdAt:
          serverTimestamp(),

        from: "coach",
        fromName: "Coach"
      }
    );

    if (subjectEl) {
      subjectEl.value = "";
    }

    if (enEl) {
      enEl.value = "";
    }

    if (esEl) {
      esEl.value = "";
    }

    if (audienceTypeEl) {
      audienceTypeEl.value =
        "all";
    }

    if (scopeEl) {
      scopeEl.value =
        "all";
    }

    if (disciplineEl) {
      disciplineEl.value = "";
    }

    clearDrafts();
    syncScopeControls();

    setStatus(
      "Posted to Announcements."
    );

    setTimeout(
      () => setStatus(""),
      1800
    );
  } catch (error) {
    console.error(
      "[bilingual-builder] post failed:",
      error
    );

    setStatus(
      "Post failed. Check console.",
      true
    );

    alert(
      "Error posting announcement."
    );
  } finally {
    if (btnPostBulletin) {
      btnPostBulletin.disabled =
        false;

      btnPostBulletin.textContent =
        btnPostBulletin.dataset.oldText ||
        "Post";

      delete btnPostBulletin.dataset.oldText;
    }
  }
}

btnPostBulletin?.addEventListener(
  "click",
  postToBulletin
);

/* =========================
   TRANSLATE BUTTONS
========================= */

btnEnToEs?.addEventListener(
  "click",
  () => handleTranslate("es")
);

btnEsToEn?.addEventListener(
  "click",
  () => handleTranslate("en")
);