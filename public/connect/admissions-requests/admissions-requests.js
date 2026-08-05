import {
  db,
  auth,
  collection,
  getDocs,
  doc,
  updateDoc,
  deleteDoc,
  serverTimestamp
} from "/assets/js/firebase-init.js";

/* =====================================================
   ELEMENTS
===================================================== */

const requestList =
  document.getElementById("requestList");

const pageStatus =
  document.getElementById("pageStatus");

const searchInput =
  document.getElementById("searchInput");

const typeFilter =
  document.getElementById("typeFilter");

const statusFilter =
  document.getElementById("statusFilter");

const refreshBtn =
  document.getElementById("refreshBtn");

const countAll =
  document.getElementById("countAll");

const countNew =
  document.getElementById("countNew");

const countApproved =
  document.getElementById("countApproved");

const countScheduled =
  document.getElementById("countScheduled");

let requests = [];

/* =====================================================
   HELPERS
===================================================== */

function esc(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function setStatus(
  message = "",
  isError = false
) {
  if (!pageStatus) return;

  pageStatus.textContent = message;
  pageStatus.className = "page-status";

  if (isError) {
    pageStatus.classList.add("error");
  }
}

function formatDate(value) {
  if (!value) return "—";

  const date =
    typeof value?.toDate === "function"
      ? value.toDate()
      : new Date(value);

  return Number.isFinite(date.getTime())
    ? date.toLocaleString()
    : "—";
}

function typeLabel(type = "") {
  const labels = {
    REQUESTED_INTRO:
      "Requested Intro",

    PROMOTIONAL_INTRO:
      "Promotional Intro",

    OPEN_PRACTICE:
      "Open Practice"
  };

  return labels[type] || type || "—";
}

function programLabel(program = "") {
  const labels = {
    "zero2hero-wrestling":
      "Zero2Hero Wrestling",

    "zero2hero-boxing":
      "Zero2Hero Boxing",

    "zero2hero-muay-thai":
      "Zero2Hero Muay Thai",

    "path2legend-wrestling":
      "Path2Legend Wrestling",

    "path2legend-boxing":
      "Path2Legend Boxing",

    "path2legend-muay-thai":
      "Path2Legend Muay Thai",

    "quest2mastery-mma":
      "Quest2Mastery MMA",

    "quest2mastery-submission-grappling":
      "Quest2Mastery Submission Grappling",

    fitness:
      "Everyday Fitness",

    "not-sure":
      "Not Sure"
  };

  return labels[program] || program || "—";
}

function statusLabel(status = "new") {
  const labels = {
    new:
      "New",

    under_review:
      "Under Review",

    approved:
      "Approved",

    declined:
      "Declined",

    scheduled:
      "Scheduled",

    completed:
      "Completed",

    proposal_ready:
      "Proposal Ready",

    enrolled:
      "Enrolled",

    closed:
      "Closed"
  };

  return labels[status] || status;
}

function pricingSummary(item) {
  if (
    item.requestType ===
    "REQUESTED_INTRO"
  ) {
    return (
      "$25 session · " +
      "$25 enrollment credit"
    );
  }

  if (
    item.requestType ===
    "PROMOTIONAL_INTRO"
  ) {
    return (
      "Complimentary session · " +
      "$25 enrollment discount"
    );
  }

  if (
    item.requestType ===
    "OPEN_PRACTICE"
  ) {
    return (
      "Complimentary by approval · " +
      "No enrollment credit or discount"
    );
  }

  return "—";
}

/* =====================================================
   AUTH
===================================================== */

function buildLoginUrl() {
  const returnTo =
    window.location.pathname +
    window.location.search;

  return (
    "/management/auth/?returnUrl=" +
    encodeURIComponent(returnTo)
  );
}

function redirectToStaffLogin() {
  window.location.href =
    buildLoginUrl();
}

async function waitForAuthState() {
  /*
   * Firebase may need a moment to restore
   * the cached login session.
   */
  for (
    let attempt = 0;
    attempt < 12;
    attempt += 1
  ) {
    if (auth.currentUser) {
      return auth.currentUser;
    }

    await new Promise((resolve) => {
      setTimeout(resolve, 100);
    });
  }

  return auth.currentUser || null;
}

async function requireStaffSession() {
  setStatus(
    "Checking staff session..."
  );

  const user =
    await waitForAuthState();

  if (!user) {
    redirectToStaffLogin();
    return false;
  }

  return true;
}

/* =====================================================
   COUNTS AND FILTERING
===================================================== */

function updateCounts() {
  if (countAll) {
    countAll.textContent =
      requests.length;
  }

  if (countNew) {
    countNew.textContent =
      requests.filter(
        (item) =>
          item.status === "new"
      ).length;
  }

  if (countApproved) {
    countApproved.textContent =
      requests.filter(
        (item) =>
          item.status === "approved"
      ).length;
  }

  if (countScheduled) {
    countScheduled.textContent =
      requests.filter(
        (item) =>
          item.status === "scheduled"
      ).length;
  }
}

function filteredRequests() {
  const query =
    String(
      searchInput?.value || ""
    )
      .trim()
      .toLowerCase();

  const selectedType =
    typeFilter?.value || "all";

  const selectedStatus =
    statusFilter?.value || "all";

  return requests.filter((item) => {
    const searchText = [
      item.contactName,
      item.athleteName,
      item.email,
      item.phone,
      item.programInterest,
      item.location,
      item.message
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    const matchesSearch =
      !query ||
      searchText.includes(query);

    const matchesType =
      selectedType === "all" ||
      item.requestType === selectedType;

    const matchesStatus =
      selectedStatus === "all" ||
      item.status === selectedStatus;

    return (
      matchesSearch &&
      matchesType &&
      matchesStatus
    );
  });
}

/* =====================================================
   RENDERING
===================================================== */

function statusOptions(item) {
  const statuses = [
    "new",
    "under_review",
    "approved",
    "declined",
    "scheduled",
    "completed",
    "proposal_ready",
    "enrolled",
    "closed"
  ];

  return statuses
    .map((status) => {
      const selected =
        item.status === status
          ? "selected"
          : "";

      return `
        <option
          value="${esc(status)}"
          ${selected}
        >
          ${esc(statusLabel(status))}
        </option>
      `;
    })
    .join("");
}

function render() {
  if (!requestList) return;

  const items =
    filteredRequests();

  if (!items.length) {
    requestList.innerHTML = `
      <div class="empty-state">
        No admissions requests match
        the current filters.
      </div>
    `;

    return;
  }

  requestList.innerHTML =
    items
      .map((item) => {
        return `
          <article class="request-card">

            <div class="request-card__top">

              <div>
                <span class="badge">
                  ${esc(
                    typeLabel(
                      item.requestType
                    )
                  )}
                </span>

                <h2>
                  ${esc(
                    item.athleteName ||
                    "Unnamed athlete"
                  )}
                </h2>

                <p>
                  ${esc(
                    item.contactName ||
                    "Unknown contact"
                  )}

                  · Submitted

                  ${esc(
                    formatDate(
                      item.createdAt
                    )
                  )}
                </p>
              </div>

              <span class="badge">
                ${esc(
                  statusLabel(
                    item.status
                  )
                )}
              </span>

            </div>

            <div class="request-card__body">

              <div class="detail-grid">

                <div class="detail">
                  <span>Email</span>

                  <strong>
                    ${esc(
                      item.email || "—"
                    )}
                  </strong>
                </div>

                <div class="detail">
                  <span>Phone</span>

                  <strong>
                    ${esc(
                      item.phone || "—"
                    )}
                  </strong>
                </div>

                <div class="detail">
                  <span>Athlete Age</span>

                  <strong>
                    ${esc(
                      item.athleteAge ??
                      "—"
                    )}
                  </strong>
                </div>

                <div class="detail">
                  <span>Program</span>

                  <strong>
                    ${esc(
                      programLabel(
                        item.programInterest
                      )
                    )}
                  </strong>
                </div>

                <div class="detail">
                  <span>Experience</span>

                  <strong>
                    ${esc(
                      item.experienceLevel ||
                      "—"
                    )}
                  </strong>
                </div>

                <div class="detail">
                  <span>Preferred Day</span>

                  <strong>
                    ${esc(
                      item.preferredDay ||
                      "—"
                    )}
                  </strong>
                </div>

                <div class="detail">
                  <span>Location</span>

                  <strong>
                    ${esc(
                      item.location || "—"
                    )}
                  </strong>
                </div>

                <div class="detail">
                  <span>Offer</span>

                  <strong>
                    ${esc(
                      pricingSummary(item)
                    )}
                  </strong>
                </div>

                <div
                  class="detail"
                  style="grid-column: 1 / -1;"
                >
                  <span>Message</span>

                  <strong>
                    ${esc(
                      item.message || "—"
                    )}
                  </strong>
                </div>

              </div>

              <div class="notes-panel">

                <label>
                  Status

                  <select
                    data-status="${esc(
                      item.id
                    )}"
                  >
                    ${statusOptions(item)}
                  </select>
                </label>

                <label>
                  Coach Notes

                  <textarea
                    rows="7"
                    data-notes="${esc(
                      item.id
                    )}"
                    placeholder="Internal notes. Never shown to the family."
                  >${esc(
                    item.coachNotes || ""
                  )}</textarea>
                </label>

                <div class="card-actions">

                  <button
                    class="save-btn"
                    type="button"
                    data-save="${esc(
                      item.id
                    )}"
                  >
                    Save
                  </button>

                  <a
                    class="save-btn"
                    href="/connect/appointments/?requestId=${encodeURIComponent(
                      item.id
                    )}"
                  >
                    Schedule
                  </a>

                  <a
                    class="save-btn"
                    href="/connect/admissions/calculator/?requestId=${encodeURIComponent(
                      item.id
                    )}"
                  >
                    Build Proposal
                  </a>

                  <button
                    class="save-btn"
                    type="button"
                    data-delete="${esc(
                      item.id
                    )}"
                  >
                    Delete
                  </button>

                </div>

              </div>

            </div>

          </article>
        `;
      })
      .join("");
}

/* =====================================================
   FIRESTORE
===================================================== */

async function loadRequests() {
  setStatus(
    "Loading admissions requests..."
  );

  try {
    const snapshot =
      await getDocs(
        collection(
          db,
          "admissions_requests"
        )
      );

    requests =
      snapshot.docs
        .map((requestDoc) => ({
          id: requestDoc.id,
          ...requestDoc.data()
        }))
        .sort((a, b) => {
          const aTime =
            typeof a.createdAt?.toMillis ===
            "function"
              ? a.createdAt.toMillis()
              : 0;

          const bTime =
            typeof b.createdAt?.toMillis ===
            "function"
              ? b.createdAt.toMillis()
              : 0;

          return bTime - aTime;
        });

    updateCounts();
    render();

    setStatus(
      `${requests.length} admissions requests loaded.`
    );
  } catch (error) {
    console.error(
      "[admissions-requests] load failed:",
      error
    );

    if (
      error?.code ===
      "permission-denied"
    ) {
      setStatus(
        "Staff access required. Redirecting to login..."
      );

      setTimeout(
        redirectToStaffLogin,
        350
      );

      return;
    }

    setStatus(
      "Unable to load admissions requests.",
      true
    );
  }
}

async function saveRequest(id) {
  const item =
    requests.find(
      (request) =>
        request.id === id
    );

  if (!item) return;

  const statusSelect =
    document.querySelector(
      `[data-status="${CSS.escape(
        id
      )}"]`
    );

  const notesInput =
    document.querySelector(
      `[data-notes="${CSS.escape(
        id
      )}"]`
    );

  const nextStatus =
    statusSelect?.value ||
    item.status;

  const nextNotes =
    String(
      notesInput?.value || ""
    ).trim();

  setStatus(
    "Saving admissions request..."
  );

  try {
    const updates = {
      status:
        nextStatus,

      requestStatus:
        nextStatus,

      coachNotes:
        nextNotes,

      updatedAt:
        serverTimestamp()
    };

    if (
      nextStatus === "approved" &&
      !item.approvedAt
    ) {
      updates.approvedAt =
        serverTimestamp();
    }

    if (
      nextStatus === "scheduled" &&
      !item.scheduledAt
    ) {
      updates.scheduledAt =
        serverTimestamp();
    }

    if (
      nextStatus === "completed" &&
      !item.completedAt
    ) {
      updates.completedAt =
        serverTimestamp();
    }

    await updateDoc(
      doc(
        db,
        "admissions_requests",
        id
      ),
      updates
    );

    item.status =
      nextStatus;

    item.requestStatus =
      nextStatus;

    item.coachNotes =
      nextNotes;

    updateCounts();
    render();

    setStatus(
      "Admissions request updated."
    );
  } catch (error) {
    console.error(
      "[admissions-requests] save failed:",
      error
    );

    if (
      error?.code ===
      "permission-denied"
    ) {
      redirectToStaffLogin();
      return;
    }

    setStatus(
      "Unable to update this request.",
      true
    );
  }
}

async function deleteRequest(id) {
  const confirmed =
    window.confirm(
      "Delete this admissions request permanently?\n\n" +
      "This cannot be undone."
    );

  if (!confirmed) return;

  setStatus(
    "Deleting admissions request..."
  );

  try {
    await deleteDoc(
      doc(
        db,
        "admissions_requests",
        id
      )
    );

    await loadRequests();
  } catch (error) {
    console.error(
      "[admissions-requests] delete failed:",
      error
    );

    if (
      error?.code ===
      "permission-denied"
    ) {
      setStatus(
        "Only an administrator can delete admissions requests.",
        true
      );

      return;
    }

    setStatus(
      "Unable to delete this request.",
      true
    );
  }
}

/* =====================================================
   EVENTS
===================================================== */

searchInput?.addEventListener(
  "input",
  render
);

typeFilter?.addEventListener(
  "change",
  render
);

statusFilter?.addEventListener(
  "change",
  render
);

refreshBtn?.addEventListener(
  "click",
  loadRequests
);

requestList?.addEventListener(
  "click",
  (event) => {
    const saveButton =
      event.target.closest(
        "[data-save]"
      );

    if (saveButton) {
      saveRequest(
        saveButton.dataset.save
      );

      return;
    }

    const deleteButton =
      event.target.closest(
        "[data-delete]"
      );

    if (deleteButton) {
      deleteRequest(
        deleteButton.dataset.delete
      );
    }
  }
);

/* =====================================================
   START
===================================================== */

if (
  await requireStaffSession()
) {
  await loadRequests();
}