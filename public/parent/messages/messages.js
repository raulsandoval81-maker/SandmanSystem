// /parent/messages/messages.js
// ------------------------------------------------------------
// Parent Communications — Coach Conversation Controller
//
// Authorization:
//   getMyAthlete()
//
// Thread root:
//   paraThreads/{athleteUid}
//
// Parent-facing behavior:
//   - no thread       → Start Conversation
//   - open thread     → Continue Conversation
//   - closed thread   → Start New Conversation
//   - limit reached   → thread remains readable
//
// Doctrine:
//   - one active thread per athlete
//   - six total messages is the recommended messaging limit
//   - the URL identifies the athlete but never authorizes access
//   - getMyAthlete() defines the authorized athlete list
// ------------------------------------------------------------

import {
  db,
  functions,
  httpsCallable,
  ensureSignedIn,
  doc,
  getDoc
} from "/assets/js/firebase-init-para.js";

await ensureSignedIn();

const THREAD_COLLECTION = "paraThreads";
const THREAD_LIMIT_TOTAL = 6;

const getMyAthleteCall =
  httpsCallable(functions, "getMyAthlete");

const listEl =
  document.getElementById("messages-list");

const langButtons =
  document.querySelectorAll(".parent-lang-btn");

/* =========================
   LANGUAGE
========================= */

function paintParentMessages(lang) {
  const showEnglish = lang === "en";

  document
    .querySelectorAll(".en")
    .forEach((element) => {
      element.style.display =
        showEnglish ? "" : "none";
    });

  document
    .querySelectorAll(".es")
    .forEach((element) => {
      element.style.display =
        showEnglish ? "none" : "";
    });
}

function setLang(lang) {
  const nextLang =
    lang === "es" ? "es" : "en";

  localStorage.setItem("lang", nextLang);

  langButtons.forEach((button) => {
    button.classList.toggle(
      "active",
      button.dataset.lang === nextLang
    );
  });

  paintParentMessages(nextLang);
}

/* =========================
   HELPERS
========================= */

function esc(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function normalizeUid(value = "") {
  return String(value || "")
    .trim()
    .toUpperCase();
}

function normalizeStatus(value = "") {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function getAthleteUid(athlete = {}) {
  return normalizeUid(
    athlete.athleteUid ||
    athlete.id ||
    athlete.uid ||
    ""
  );
}

function getAthleteName(athlete = {}) {
  return String(
    athlete.athleteName ||
    athlete.fullName ||
    athlete.name ||
    athlete.publicName ||
    getAthleteUid(athlete) ||
    "Athlete"
  ).trim();
}

function getMessageCount(thread = {}) {
  const stored =
    Number(thread.messageCount);

  return Number.isFinite(stored)
    ? Math.max(0, stored)
    : 0;
}

function threadHref(athleteUid) {
  return (
    "/communications/parent/thread.html?id=" +
    encodeURIComponent(athleteUid)
  );
}

function composeHref(
  athleteUid,
  mode = ""
) {
  const params =
    new URLSearchParams({
      id: athleteUid
    });

  if (mode) {
    params.set("mode", mode);
  }

  return (
    "/communications/parent/compose.html?" +
    params.toString()
  );
}

function isClosedThread(thread = {}) {
  const status =
    normalizeStatus(
      thread.status ||
      thread.state ||
      thread.threadStatus ||
      ""
    );

  return (
    thread.closed === true ||
    thread.isClosed === true ||
    status === "closed" ||
    status === "resolved" ||
    status === "complete" ||
    status === "completed" ||
    status === "archived"
  );
}

function timestampSeconds(thread = {}) {
  return Number(
    thread.lastReplyAt?.seconds ||
    thread.updatedAt?.seconds ||
    thread.createdAt?.seconds ||
    0
  );
}

function renderError(message) {
  if (!listEl) return;

  listEl.innerHTML = `
    <div class="empty">
      ${esc(message)}
    </div>
  `;
}

/* =========================
   ATHLETE AUTHORIZATION
========================= */

async function getAuthorizedAthletes() {
  const result =
    await getMyAthleteCall({});

  const data =
    result?.data || {};

  console.log(
    "[parent-messages] getMyAthlete:",
    data
  );

  if (
    data.ok !== true ||
    data.linked !== true
  ) {
    return [];
  }

  const athletes =
    Array.isArray(data.athletes)
      ? [...data.athletes]
      : [];

  if (data.athlete) {
    athletes.push(data.athlete);
  }

  const seen = new Set();

  return athletes.filter((athlete) => {
    const athleteUid =
      getAthleteUid(athlete);

    if (
      !athleteUid ||
      seen.has(athleteUid)
    ) {
      return false;
    }

    seen.add(athleteUid);
    return true;
  });
}

/* =========================
   THREAD LOADING
========================= */

async function readThreadForAthlete(
  athlete
) {
  const athleteUid =
    getAthleteUid(athlete);

  const athleteName =
    getAthleteName(athlete);

  if (!athleteUid) {
    return null;
  }

  const threadRef =
    doc(
      db,
      THREAD_COLLECTION,
      athleteUid
    );

  const snapshot =
    await getDoc(threadRef);

  if (!snapshot.exists()) {
    return {
      athleteUid,
      athleteName,
      threadExists: false,
      messageCount: 0
    };
  }

  const data =
    snapshot.data() || {};

  if (
    data.deleted === true ||
    normalizeStatus(data.status) === "deleted"
  ) {
    return {
      athleteUid,
      athleteName,
      threadExists: false,
      messageCount: 0
    };
  }

  return {
    ...data,
    id: athleteUid,
    athleteUid,
    athleteName,
    threadExists: true
  };
}

async function loadConversations() {
  if (!listEl) return;

  listEl.innerHTML = `
    <div class="empty">
      <span class="en">
        Loading coach conversation...
      </span>

      <span class="es">
        Cargando conversación con el entrenador...
      </span>
    </div>
  `;

  paintParentMessages(
    localStorage.getItem("lang") || "en"
  );

  try {
    const athletes =
      await getAuthorizedAthletes();

    if (!athletes.length) {
      renderError(
        "No authorized athlete is linked to this parent account."
      );
      return;
    }

    const rows =
      (
        await Promise.all(
          athletes.map(
            readThreadForAthlete
          )
        )
      )
        .filter(Boolean)
        .sort((a, b) => {
          if (
            a.threadExists !==
            b.threadExists
          ) {
            return a.threadExists
              ? -1
              : 1;
          }

          return (
            timestampSeconds(b) -
            timestampSeconds(a)
          );
        });

    renderConversations(rows);
  } catch (error) {
    console.error(
      "[parent-messages] load failed:",
      error
    );

    renderError(
      "Unable to load the coach conversation."
    );
  }
}

/* =========================
   RENDER
========================= */

function renderConversations(rows) {
  if (!listEl) return;

  listEl.innerHTML =
    rows.map((row) => {
      const messageCount =
        getMessageCount(row);

      const limitReached =
        messageCount >=
        THREAD_LIMIT_TOTAL;

      const closed =
        row.threadExists &&
        isClosedThread(row);

      let href = "";
      let cardClass = "";
      let actionEN = "";
      let actionES = "";
      let descriptionEN = "";
      let descriptionES = "";

      if (!row.threadExists) {
        href =
          composeHref(row.athleteUid);

        cardClass =
          "conversation-new";

        actionEN =
          "Start Conversation";

        actionES =
          "Iniciar Conversación";

        descriptionEN =
          "Send a private question, absence notice, concern, or athlete update to the coach.";

        descriptionES =
          "Envíe al entrenador una pregunta privada, aviso de ausencia, inquietud o actualización del atleta.";
      } else if (closed) {
        href =
          composeHref(
            row.athleteUid,
            "new"
          );

        cardClass =
          "conversation-closed";

        actionEN =
          "Start New Conversation";

        actionES =
          "Iniciar Nueva Conversación";

        descriptionEN =
          "The previous conversation is closed. Start a new conversation when another issue needs attention.";

        descriptionES =
          "La conversación anterior está cerrada. Inicie una nueva cuando otro asunto necesite atención.";
      } else {
        href =
          threadHref(row.athleteUid);

        cardClass =
          limitReached
            ? "limit-reached"
            : "conversation-open";

        actionEN =
          limitReached
            ? "Read Conversation"
            : "Continue Conversation";

        actionES =
          limitReached
            ? "Leer Conversación"
            : "Continuar Conversación";

        descriptionEN =
          limitReached
            ? "The messaging limit has been reached. The conversation remains readable, but additional discussion should happen by phone or in person."
            : "Open the athlete’s current private conversation with the coach.";

        descriptionES =
          limitReached
            ? "Se alcanzó el límite de mensajes. La conversación permanece disponible, pero la conversación adicional debe realizarse por teléfono o en persona."
            : "Abra la conversación privada actual del atleta con el entrenador.";
      }

      const subject =
        row.subject ||
        "Coach Conversation";

      const preview =
        row.lastBody ||
        row.lastMessage ||
        descriptionEN;

      return `
        <a
          class="thread-card ${cardClass}"
          href="${href}"
        >
          <div class="thread-title">
            ${esc(row.athleteName || "Athlete")}
          </div>

          ${
            row.threadExists
              ? `
                <div class="thread-subject">
                  ${esc(subject)}
                </div>

                <div class="thread-preview">
                  ${esc(preview)}
                </div>
              `
              : `
                <div class="thread-preview">
                  <span class="en">
                    ${esc(descriptionEN)}
                  </span>

                  <span class="es">
                    ${esc(descriptionES)}
                  </span>
                </div>
              `
          }

          <div class="thread-action">
            <span class="en">
              ${esc(actionEN)}
            </span>

            <span class="es">
              ${esc(actionES)}
            </span>
          </div>

          ${
            row.threadExists
              ? `
                <div class="thread-count">
                  ${messageCount}/${THREAD_LIMIT_TOTAL}
                  <span class="en">messages</span>
                  <span class="es">mensajes</span>
                </div>
              `
              : ""
          }

          ${
            limitReached
              ? `
                <div class="thread-policy">
                  <span class="en">
                    Arrange a call or sit-down if more discussion is needed.
                  </span>

                  <span class="es">
                    Organice una llamada o reunión si se necesita más conversación.
                  </span>
                </div>
              `
              : ""
          }
        </a>
      `;
    }).join("");

  paintParentMessages(
    localStorage.getItem("lang") || "en"
  );
}

/* =========================
   BOOT
========================= */

document.addEventListener(
  "DOMContentLoaded",
  () => {
    const savedLanguage =
      localStorage.getItem("lang") ||
      "en";

    setLang(savedLanguage);

    langButtons.forEach((button) => {
      button.addEventListener(
        "click",
        () => {
          setLang(
            button.dataset.lang
          );
        }
      );
    });

    loadConversations();
  }
);
