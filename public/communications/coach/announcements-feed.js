// /communications/coach/announcements-feed.js
// ------------------------------------------------------------
// Admin Announcements Feed
// - PIN
// - EDIT
// - ARCHIVE / UNARCHIVE
// - SOFT DELETE
// - SHOW / HIDE ARCHIVED
// - Discipline-aware scope labels
//
// Existing announcements without scope fields are treated
// as All Disciplines.
// ------------------------------------------------------------

import {
  db,
  ensureSignedIn,
  collection,
  query,
  orderBy,
  limit,
  onSnapshot,
  doc,
  updateDoc,
  serverTimestamp
} from "/assets/js/firebase-init-para.js";

import {
  renderAnnouncementCard,
  sortPinnedThenNewest
} from "/communications/shared/announcements-ui.js";

const TEAM_ID = "law";

const feedEl =
  document.getElementById("bc-feed") ||
  document.getElementById("feed");

const emptyEl =
  document.getElementById("empty");

const statusEl =
  document.getElementById("bc-status") ||
  document.getElementById("status");

const toggleBtn =
  document.getElementById("toggle-archived");

let showArchived = false;
let cachedItems = [];

/* =========================
   HELPERS
========================= */

function setStatus(message = "") {
  if (!statusEl) return;
  statusEl.textContent = message;
}

function escapeHTML(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function normalizeDiscipline(value = "") {
  const raw = String(value || "")
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

function disciplineLabel(value = "") {
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

  return labels[normalized] ||
    normalized ||
    "All Disciplines";
}

function scopeLabel(item = {}) {
  const scope = String(
    item.scope ||
    (
      item.discipline
        ? "discipline"
        : "all"
    )
  )
    .trim()
    .toLowerCase();

  if (scope === "discipline") {
    return disciplineLabel(
      item.discipline
    );
  }

  return "All Disciplines";
}

function audienceLabel(value = "") {
  const audience = String(
    value || "all"
  )
    .trim()
    .toLowerCase();

  if (audience === "parents") {
    return "Parents";
  }

  if (audience === "athletes") {
    return "Athletes";
  }

  return "Athletes + Parents";
}

function showError(message) {
  if (feedEl) {
    feedEl.innerHTML = `
      <div
        class="card"
        style="opacity:.75;"
      >
        ${escapeHTML(message)}
      </div>
    `;
  }

  if (emptyEl) {
    emptyEl.style.display = "none";
  }
}

function updateToggleLabel() {
  if (!toggleBtn) return;

  toggleBtn.textContent =
    showArchived
      ? "Hide Archived"
      : "Show Archived";
}

/* =========================
   AUTH
========================= */

try {
  await ensureSignedIn();
} catch (error) {
  showError(
    "Sign-in required. Refresh."
  );

  throw error;
}

if (!feedEl) {
  throw new Error(
    "Announcements feed container not found."
  );
}

/* =========================
   TOGGLE
========================= */

updateToggleLabel();

toggleBtn?.addEventListener(
  "click",
  () => {
    showArchived =
      !showArchived;

    updateToggleLabel();
    renderFeed();
  }
);

/* =========================
   QUERY
========================= */

const qRef = query(
  collection(
    db,
    "paraAnnouncements"
  ),
  orderBy(
    "createdAt",
    "desc"
  ),
  limit(80)
);

/* =========================
   CARD
========================= */

function renderAdminCard(item) {
  const base =
    renderAnnouncementCard(
      item,
      {
        showTeam: true,
        showAudience: true,
        showPinned: true,
        showCategory: true
      }
    );

  const scope =
    scopeLabel(item);

  const audience =
    audienceLabel(
      item.audienceType
    );

  return `
    <div
      class="admin-ann-wrap"
      data-id="${escapeHTML(item.id)}"
      data-pinned="${item.pinned === true}"
    >
      ${base}

      <div
        class="meta-line"
        style="
          margin-top:-10px;
          margin-bottom:10px;
          display:flex;
          justify-content:flex-end;
          gap:8px;
          flex-wrap:wrap;
        "
      >
        <span
          style="
            display:inline-flex;
            align-items:center;
            padding:5px 9px;
            border:1px solid rgba(255,255,255,.14);
            border-radius:999px;
            font-size:.75rem;
            font-weight:800;
            opacity:.85;
          "
        >
          ${escapeHTML(audience)}
        </span>

        <span
          style="
            display:inline-flex;
            align-items:center;
            padding:5px 9px;
            border:1px solid rgba(255,221,72,.24);
            border-radius:999px;
            color:#ffdd48;
            font-size:.75rem;
            font-weight:800;
          "
        >
          ${escapeHTML(scope)}
        </span>
      </div>

      <div
        class="meta-line"
        style="
          margin-bottom:14px;
          display:flex;
          justify-content:flex-end;
          gap:8px;
          flex-wrap:wrap;
        "
      >
        <button
          data-act="pin"
          data-id="${escapeHTML(item.id)}"
        >
          ${item.pinned === true ? "Unpin" : "Pin"}
        </button>

        <button
          data-act="edit"
          data-id="${escapeHTML(item.id)}"
        >
          Edit
        </button>

        ${
          item.archived === true
            ? `
              <button
                data-act="unarchive"
                data-id="${escapeHTML(item.id)}"
              >
                Unarchive
              </button>
            `
            : `
              <button
                data-act="archive"
                data-id="${escapeHTML(item.id)}"
              >
                Archive
              </button>
            `
        }

        <button
          data-act="delete"
          data-id="${escapeHTML(item.id)}"
        >
          Delete
        </button>
      </div>
    </div>
  `;
}

/* =========================
   RENDER
========================= */

function renderFeed() {
  if (!feedEl) return;

  const visible =
    cachedItems.filter((item) => {
      if (
        item.teamId !== TEAM_ID
      ) {
        return false;
      }

      if (
        item.deleted === true
      ) {
        return false;
      }

      if (showArchived) {
        return true;
      }

      return (
        item.archived !== true
      );
    });

  const sorted =
    sortPinnedThenNewest(
      visible
    );

  if (!sorted.length) {
    feedEl.innerHTML = "";

    if (emptyEl) {
      emptyEl.style.display =
        "block";
    }

    return;
  }

  if (emptyEl) {
    emptyEl.style.display =
      "none";
  }

  feedEl.innerHTML =
    sorted
      .map(renderAdminCard)
      .join("");

  bindActions();
}

/* =========================
   ACTIONS
========================= */

function bindActions() {
  feedEl
    .querySelectorAll(
      "button[data-act]"
    )
    .forEach((button) => {
      button.onclick =
        async () => {
          const action =
            button.dataset.act;

          const id =
            button.dataset.id;

          if (
            !action ||
            !id
          ) {
            return;
          }

          const item =
            cachedItems.find(
              (entry) =>
                entry.id === id
            );

          try {
            if (action === "pin") {
              if (!item) return;

              const nextPinned =
                item.pinned !== true;

              await updateDoc(
                doc(
                  db,
                  "paraAnnouncements",
                  id
                ),
                {
                  pinned:
                    nextPinned,

                  ...(nextPinned
                    ? {
                        pinnedAt:
                          serverTimestamp()
                      }
                    : {
                        unpinnedAt:
                          serverTimestamp()
                      })
                }
              );
            }

            if (action === "archive") {
              if (
                !confirm(
                  "Archive this announcement?"
                )
              ) {
                return;
              }

              await updateDoc(
                doc(
                  db,
                  "paraAnnouncements",
                  id
                ),
                {
                  archived: true,
                  archivedAt:
                    serverTimestamp()
                }
              );
            }

            if (
              action === "unarchive"
            ) {
              await updateDoc(
                doc(
                  db,
                  "paraAnnouncements",
                  id
                ),
                {
                  archived: false,
                  unarchivedAt:
                    serverTimestamp()
                }
              );
            }

            if (action === "delete") {
              if (
                !confirm(
                  "Delete this announcement? This is a soft delete."
                )
              ) {
                return;
              }

              await updateDoc(
                doc(
                  db,
                  "paraAnnouncements",
                  id
                ),
                {
                  deleted: true,
                  deletedAt:
                    serverTimestamp()
                }
              );
            }

            if (action === "edit") {
              if (!item) return;

              const title =
                prompt(
                  "Edit title:",
                  item.title || ""
                );

              if (title === null) {
                return;
              }

              const message =
                prompt(
                  "Edit message:",
                  item.message || ""
                );

              if (message === null) {
                return;
              }

              await updateDoc(
                doc(
                  db,
                  "paraAnnouncements",
                  id
                ),
                {
                  title:
                    String(title).trim() ||
                    "(no title)",

                  message:
                    String(message),

                  editedAt:
                    serverTimestamp()
                }
              );
            }
          } catch (error) {
            console.error(
              "[announcements-feed] action failed:",
              error
            );

            setStatus(
              "Action failed. Check console."
            );
          }
        };
    });
}

/* =========================
   SNAPSHOT
========================= */

onSnapshot(
  qRef,
  (snapshot) => {
    cachedItems = [];

    snapshot.forEach(
      (document) => {
        cachedItems.push({
          id: document.id,
          ...document.data()
        });
      }
    );

    setStatus("");
    renderFeed();
  },
  (error) => {
    console.error(
      "[announcements-feed] snapshot error:",
      error
    );

    showError(
      "Error loading broadcasts."
    );

    setStatus(
      "Unable to load announcements."
    );
  }
);