import {
  db,
  collection,
  onSnapshot,
  query,
  orderBy,
  doc,
  updateDoc,
  serverTimestamp
} from "/assets/js/firebase-init-para.js";

const listEl = document.getElementById("inbox-list");
const emptyEl = document.getElementById("inbox-empty");
const searchEl = document.getElementById("inbox-search");
const filterBtns = document.querySelectorAll("[data-filter]");

let currentFilter = "pending";
let allRows = [];
let searchTerm = "";

// ------------------ helpers ------------------

function esc(s = "") {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function safeDate(ts) {
  try {
    return ts?.toDate?.().toLocaleString() || "";
  } catch {
    return "";
  }
}

function getStatus(d) {
  return d.status || "pending";
}

// ------------------ filters ------------------

function matchesFilter(d) {
  const status = getStatus(d);

  if (currentFilter === "pending") return status === "pending";
  if (currentFilter === "approved") return status === "approved_trial" || status === "approved_join";
  if (currentFilter === "archived") return status === "archived";
  if (currentFilter === "deleted") return status === "deleted";
  if (currentFilter === "all") return true;

  return true;
}

function matchesSearch(d) {
  if (!searchTerm) return true;

  const hay = [
    d.parentName || "",
    d.athleteName || "",
    d.message || ""
  ].join(" ").toLowerCase();

  return hay.includes(searchTerm);
}

// ------------------ badge ------------------

function buildBadge(d) {
  const status = getStatus(d);
  const unread = d.coachHasUnread === true;

  if (unread && status === "pending") {
    return `<span class="pill pill-unread">NEW</span>`;
  }

  if (status === "approved_trial") {
    return `<span class="pill pill-approved">TRIAL APPROVED</span>`;
  }

  if (status === "approved_join") {
    return `<span class="pill pill-approved">JOIN APPROVED</span>`;
  }

  if (status === "archived") {
    return `<span class="pill pill-archived">ARCHIVED</span>`;
  }

  if (status === "deleted") {
    return `<span class="pill pill-deleted">DELETED</span>`;
  }

  return `<span class="pill pill-read">PENDING</span>`;
}

// ------------------ actions ------------------

function buildActions(id, d) {
  const status = getStatus(d);

  if (status === "pending") {
    return `
      <div class="inbox-actions">
        <button type="button" class="btn-approve-trial" data-id="${id}">Approve Trial</button>
        <button type="button" class="btn-approve-join" data-id="${id}">Approve Join</button>
        <button type="button" class="btn-archive" data-id="${id}">Archive</button>
      </div>
    `;
  }

  if (status === "archived") {
    return `
      <div class="inbox-actions">
        <button type="button" class="btn-restore" data-id="${id}">Restore</button>
        <button type="button" class="btn-delete" data-id="${id}">Delete</button>
      </div>
    `;
  }

  if (status === "deleted") {
    return `
      <div class="inbox-actions">
        <button type="button" class="btn-restore" data-id="${id}">Restore</button>
      </div>
    `;
  }

  return `
    <div class="inbox-actions">
      <button type="button" class="btn-archive" data-id="${id}">Archive</button>
    </div>
  `;
}

// ------------------ row ------------------

function buildRow(id, d) {
  const unread = d.coachHasUnread === true;
  const status = getStatus(d);

  return `
    <div class="inbox-row-wrap" data-id="${id}">
      <a class="inbox-item ${unread && status === "pending" ? "unread" : "read"}"
         href="/para/coach/inbox-view.html?id=${id}">

        <div class="inbox-head">
          <div class="inbox-subject">
            ${esc(d.athleteName || "New Request")}
          </div>
          ${buildBadge(d)}
        </div>

        <div class="inbox-meta">
          <span>${esc(d.parentName || "")}</span>
          <span>${d.entryType === "join" ? "JOIN" : "TRIAL"}</span>
          <span>${safeDate(d.createdAt)}</span>
        </div>

        <div class="inbox-preview">
          ${esc(d.message || "")}
        </div>

      </a>

      ${buildActions(id, d)}
    </div>
  `;
}

// ------------------ render ------------------

function setActiveFilterBtn() {
  filterBtns.forEach((btn) => {
    btn.classList.toggle("is-active", btn.dataset.filter === currentFilter);
  });
}

function renderRows() {
  const rows = allRows.filter((d) => matchesFilter(d) && matchesSearch(d));

  if (!rows.length) {
    listEl.innerHTML = "";
    emptyEl.style.display = "block";
    return;
  }

  emptyEl.style.display = "none";
  listEl.innerHTML = rows.map((d) => buildRow(d._id, d)).join("");
}

// ------------------ actions logic ------------------

async function approveTrial(id) {
  await updateDoc(doc(db, "paraParentInbox", id), {
    status: "approved_trial",
    approvedAt: serverTimestamp()
  });
}

async function approveJoin(id) {
  await updateDoc(doc(db, "paraParentInbox", id), {
    status: "approved_join",
    approvedAt: serverTimestamp()
  });
}

async function archiveRequest(id) {
  await updateDoc(doc(db, "paraParentInbox", id), {
    status: "archived",
    archivedAt: serverTimestamp()
  });
}

async function deleteRequest(id) {
  const ok = window.confirm("Delete this request?");
  if (!ok) return;

  await updateDoc(doc(db, "paraParentInbox", id), {
    status: "deleted",
    deletedAt: serverTimestamp()
  });
}

async function restoreRequest(id) {
  await updateDoc(doc(db, "paraParentInbox", id), {
    status: "pending",
    restoredAt: serverTimestamp()
  });
}

// ------------------ listener ------------------

const qRef = query(
  collection(db, "paraParentInbox"),
  orderBy("createdAt", "desc")
);

onSnapshot(qRef, (snap) => {
  const rows = [];

  snap.forEach((docSnap) => {
    rows.push({ ...docSnap.data(), _id: docSnap.id });
  });

  allRows = rows;
  renderRows();
});

// ------------------ click handling ------------------

listEl.addEventListener("click", async (e) => {
  const trialBtn = e.target.closest(".btn-approve-trial");
  if (trialBtn) {
    e.preventDefault();
    e.stopPropagation();
    await approveTrial(trialBtn.dataset.id);
    return;
  }

  const joinBtn = e.target.closest(".btn-approve-join");
  if (joinBtn) {
    e.preventDefault();
    e.stopPropagation();
    await approveJoin(joinBtn.dataset.id);
    return;
  }

  const archiveBtn = e.target.closest(".btn-archive");
  if (archiveBtn) {
    e.preventDefault();
    e.stopPropagation();
    await archiveRequest(archiveBtn.dataset.id);
    return;
  }

  const deleteBtn = e.target.closest(".btn-delete");
  if (deleteBtn) {
    e.preventDefault();
    e.stopPropagation();
    await deleteRequest(deleteBtn.dataset.id);
    return;
  }

  const restoreBtn = e.target.closest(".btn-restore");
  if (restoreBtn) {
    e.preventDefault();
    e.stopPropagation();
    await restoreRequest(restoreBtn.dataset.id);
  }
});

// ------------------ filters ------------------

filterBtns.forEach((btn) => {
  btn.addEventListener("click", () => {
    currentFilter = btn.dataset.filter || "pending";
    setActiveFilterBtn();
    renderRows();
  });
});

searchEl.addEventListener("input", () => {
  searchTerm = searchEl.value.trim().toLowerCase();
  renderRows();
});

setActiveFilterBtn();