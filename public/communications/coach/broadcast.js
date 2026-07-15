// /communications/coach/broadcast.js
// ------------------------------------------------------------
// Broadcast Console — Discipline-Aware Announcements
//
// Audience Type:
// - all
// - parents
// - athletes
//
// Scope:
// - all
// - discipline
//
// Discipline:
// - wrestling
// - boxing
// - kickboxing
// - mma
// - submission-grappling
//
// Existing announcements without scope fields remain global.
// ------------------------------------------------------------

import {
  db,
  ensureSignedIn,
  collection,
  addDoc,
  query,
  orderBy,
  limit,
  onSnapshot,
  serverTimestamp,
  doc,
  updateDoc
} from "/assets/js/firebase-init-para.js";

import {
  renderAnnouncementCard,
  sortPinnedThenNewest
} from "/communications/shared/announcements-ui.js";

await ensureSignedIn();

/* =========================
   CONFIG
========================= */

const TEAM_ID = "law";

const DISCIPLINES = [
  ["", "Select Discipline"],
  ["wrestling", "Wrestling"],
  ["boxing", "Boxing"],
  ["kickboxing", "Kickboxing"],
  ["mma", "MMA"],
  [
    "submission-grappling",
    "Submission Grappling"
  ]
];

/* =========================
   DOM
========================= */

const categoryEl =
  document.getElementById("bc-category");

const titleEl =
  document.getElementById("bc-title");

const messageEl =
  document.getElementById("bc-message");

const audTypeEl =
  document.getElementById("bc-audience-type");

const scopeEl =
  document.getElementById("bc-scope");

const disciplineEl =
  document.getElementById("bc-discipline");

const btnPost =
  document.getElementById("bc-post");

const feedEl =
  document.getElementById("bc-feed");

const statusEl =
  document.getElementById("bc-status");

const toggleArchivedBtn =
  document.getElementById(
    "toggle-archived"
  );

/* =========================
   STATE
========================= */

let annItems = [];
let showArchived = false;

/* =========================
   HELPERS
========================= */

function setStatus(message = "") {
  if (!statusEl) return;

  statusEl.textContent =
    message;
}

function escapeHTML(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
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
    normalized ||
    "All Disciplines"
  );
}

function syncCategoryTitle() {
  const category =
    String(
      categoryEl?.value || ""
    ).trim();

  const isOther =
    category === "Other";

  if (!titleEl) return;

  titleEl.disabled =
    !isOther;

  titleEl.placeholder =
    isOther
      ? "Custom title…"
      : "Preset title will be used";

  if (!isOther) {
    titleEl.value = "";
  }
}

function getTitle() {
  const category =
    String(
      categoryEl?.value || ""
    ).trim();

  if (!category) {
    return "";
  }

  if (category !== "Other") {
    return category;
  }

  return String(
    titleEl?.value || ""
  ).trim();
}

function updateArchivedToggleLabel() {
  if (!toggleArchivedBtn) return;

  toggleArchivedBtn.textContent =
    showArchived
      ? "Hide Archived"
      : "Show Archived";
}

function syncScopeControls() {
  if (
    !scopeEl ||
    !disciplineEl
  ) {
    return;
  }

  const isDiscipline =
    scopeEl.value === "discipline";

  disciplineEl.disabled =
    !isDiscipline;

  if (!isDiscipline) {
    disciplineEl.value = "";
  }
}

function ensureDisciplineOptions() {
  if (!disciplineEl) return;

  if (disciplineEl.options.length) {
    return;
  }

  disciplineEl.innerHTML =
    DISCIPLINES
      .map(([value, label]) => `
        <option value="${escapeHTML(value)}">
          ${escapeHTML(label)}
        </option>
      `)
      .join("");
}

function announcementScopeLabel(
  item = {}
) {
  const scope =
    String(
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

/* =========================
   INIT
========================= */

ensureDisciplineOptions();
syncCategoryTitle();
syncScopeControls();
updateArchivedToggleLabel();

categoryEl?.addEventListener(
  "change",
  syncCategoryTitle
);

scopeEl?.addEventListener(
  "change",
  syncScopeControls
);

/* =========================
   POST
========================= */

btnPost?.addEventListener(
  "click",
  async () => {
    const category =
      String(
        categoryEl?.value || ""
      ).trim();

    const title =
      getTitle();

    const message =
      String(
        messageEl?.value || ""
      ).trim();

    const audienceType =
      String(
        audTypeEl?.value || "all"
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
            disciplineEl?.value || ""
          )
        : "";

    if (!category) {
      alert("Select category.");
      return;
    }

    if (!title) {
      alert("Title required.");
      return;
    }

    if (!message) {
      alert("Message required.");
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

    btnPost.disabled = true;

    const oldText =
      btnPost.textContent;

    btnPost.textContent =
      "Posting…";

    setStatus("Posting…");

    try {
      await addDoc(
        collection(
          db,
          "paraAnnouncements"
        ),
        {
          teamId: TEAM_ID,

          category,
          title,
          message,

          pinned: false,
          archived: false,
          deleted: false,

          audienceType,

          scope,
          discipline,

          createdAt:
            serverTimestamp(),

          from: "coach",
          fromName: "Coach"
        }
      );

      if (categoryEl) {
        categoryEl.value = "";
      }

      if (titleEl) {
        titleEl.value = "";
      }

      if (messageEl) {
        messageEl.value = "";
      }

      if (audTypeEl) {
        audTypeEl.value = "all";
      }

      if (scopeEl) {
        scopeEl.value = "all";
      }

      if (disciplineEl) {
        disciplineEl.value = "";
      }

      syncCategoryTitle();
      syncScopeControls();

      setStatus("Posted.");

      setTimeout(
        () => setStatus(""),
        1200
      );
    } catch (error) {
      console.error(
        "Broadcast post error:",
        error
      );

      alert(
        error?.message ||
        "Post failed. Check console."
      );

      setStatus(
        "Post failed."
      );
    } finally {
      btnPost.disabled = false;

      btnPost.textContent =
        oldText || "Post";
    }
  }
);

/* =========================
   ARCHIVED TOGGLE
========================= */

toggleArchivedBtn?.addEventListener(
  "click",
  () => {
    showArchived =
      !showArchived;

    updateArchivedToggleLabel();
    renderFeed();
  }
);

/* =========================
   ADMIN FEED
========================= */

function renderFeed() {
  if (!feedEl) return;

  const visible =
    annItems.filter((item) => {
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
    feedEl.innerHTML = `
      <div
        style="
          opacity:.75;
          padding:10px 0;
        "
      >
        No broadcasts yet.
      </div>
    `;

    return;
  }

  feedEl.innerHTML =
    sorted
      .map((item) => {
        const card =
          renderAnnouncementCard(
            item,
            {
              showTeam: true,
              showAudience: true,
              showPinned: true,
              showCategory: true
            }
          );

        const scopeLabel =
          announcementScopeLabel(
            item
          );

        return `
          <div
            class="admin-ann-wrap"
            data-id="${escapeHTML(item.id)}"
          >
            ${card}

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
                ${escapeHTML(scopeLabel)}
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
                class="btn btn-dark btn-sm"
                data-act="pin"
                data-id="${escapeHTML(item.id)}"
              >
                ${
                  item.pinned === true
                    ? "Unpin"
                    : "Pin"
                }
              </button>

              <button
                class="btn btn-dark btn-sm"
                data-act="edit"
                data-id="${escapeHTML(item.id)}"
              >
                Edit
              </button>

              ${
                item.archived === true
                  ? `
                    <button
                      class="btn btn-dark btn-sm"
                      data-act="unarchive"
                      data-id="${escapeHTML(item.id)}"
                    >
                      Unarchive
                    </button>
                  `
                  : `
                    <button
                      class="btn btn-dark btn-sm"
                      data-act="archive"
                      data-id="${escapeHTML(item.id)}"
                    >
                      Archive
                    </button>
                  `
              }

              <button
                class="btn btn-dark btn-sm"
                data-act="delete"
                data-id="${escapeHTML(item.id)}"
              >
                Delete
              </button>
            </div>
          </div>
        `;
      })
      .join("");

  feedEl
    .querySelectorAll(
      "button[data-act]"
    )
    .forEach((button) => {
      button.addEventListener(
        "click",
        async () => {
          const action =
            button.getAttribute(
              "data-act"
            );

          const id =
            button.getAttribute(
              "data-id"
            );

          if (
            !action ||
            !id
          ) {
            return;
          }

          try {
            if (action === "pin") {
              const item =
                annItems.find(
                  (entry) =>
                    entry.id === id
                );

              if (!item) return;

              const next =
                item.pinned !== true;

              await updateDoc(
                doc(
                  db,
                  "paraAnnouncements",
                  id
                ),
                {
                  pinned: next,

                  ...(next
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
                  "Delete this announcement? (soft delete)"
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
              const item =
                annItems.find(
                  (entry) =>
                    entry.id === id
                );

              if (!item) return;

              const nextTitle =
                prompt(
                  "Edit title:",
                  item.title || ""
                );

              if (
                nextTitle === null
              ) {
                return;
              }

              const nextMessage =
                prompt(
                  "Edit message:",
                  item.message || ""
                );

              if (
                nextMessage === null
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
                  title:
                    String(
                      nextTitle
                    ).trim() ||
                    "(no title)",

                  message:
                    String(
                      nextMessage
                    ),

                  editedAt:
                    serverTimestamp()
                }
              );
            }
          } catch (error) {
            console.error(
              "[broadcast] action failed:",
              error
            );

            alert(
              "Action failed. Check console."
            );
          }
        }
      );
    });
}

/* =========================
   LISTENER
========================= */

onSnapshot(
  query(
    collection(
      db,
      "paraAnnouncements"
    ),
    orderBy(
      "createdAt",
      "desc"
    ),
    limit(60)
  ),
  (snapshot) => {
    annItems = [];

    snapshot.forEach(
      (document) => {
        annItems.push({
          id: document.id,
          ...document.data()
        });
      }
    );

    renderFeed();
  },
  (error) => {
    console.error(
      "[broadcast] snapshot error:",
      error
    );

    if (feedEl) {
      feedEl.innerHTML = `
        <div
          style="
            opacity:.75;
            padding:10px 0;
          "
        >
          Error loading broadcasts.
        </div>
      `;
    }
  }
);