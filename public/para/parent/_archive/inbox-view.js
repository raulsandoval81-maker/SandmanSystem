// ----------------------------------------------------------
// /para/parent/inbox-view.js
// Parent Inbox (Unified Thread Model)
// Shows ONLY this parent's thread (filtered by parentKey)
// ----------------------------------------------------------

import {
  db,
  ensureSignedIn,
  collection,
  getDocs,
  query,
  where,
  orderBy,
  limit
} from "/assets/js/firebase-init-para.js";

await ensureSignedIn();

const ROOT_COLLECTION = "paraParentInbox";

const statusEl = document.getElementById("status");
const listEl = document.getElementById("thread-list");

// Parent identity anchor (must match compose.js logic)
function getParentKey() {
  return (
    localStorage.getItem("paraParentKey") ||
    localStorage.getItem("parentKey") ||
    null
  );
}

function esc(s="") {
  return String(s)
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#39;");
}

async function loadThreads() {
  statusEl.textContent = "Loading…";
  listEl.innerHTML = "";

  const parentKey = getParentKey();

  if (!parentKey) {
    statusEl.textContent = "No parent session found.";
    return;
  }

  const colRef = collection(db, ROOT_COLLECTION);

  const q = query(
    colRef,
    where("parentKey", "==", parentKey),
    where("deleted", "==", false),
    orderBy("lastReplyAt", "desc"),
    limit(10)
  );

  const snap = await getDocs(q);

  if (snap.empty) {
    statusEl.textContent = "No messages yet.";
    return;
  }

  statusEl.textContent = "";

  const rows = snap.docs.map(d => {
    const data = d.data() || {};
    const subject = esc(data.subject || "Message");
    const preview = esc(data.lastBody || "");
    const id = encodeURIComponent(d.id);

    return `
      <a class="pc-card" href="/para/parent/thread.html?id=${id}">
        <div class="pc-card-title">${subject}</div>
        <div class="pc-card-body">${preview}</div>
      </a>
    `;
  });

  listEl.innerHTML = rows.join("");
}

loadThreads();