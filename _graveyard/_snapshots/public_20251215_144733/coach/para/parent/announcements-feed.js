// announcements-feed.js — PILOT UPGRADE EDITION

import {
  db,
  collection,
  query,
  orderBy,
  onSnapshot,
  doc,
  getDoc,
  deleteDoc,
  updateDoc
} from "/data/firebase-init.js";

const listEl = document.getElementById("ann-list");

// Sort pinned first, then newest
const q = query(
  collection(db, "announcements"),
  orderBy("pinned", "desc"),
  orderBy("createdAt", "desc")
);

onSnapshot(q, (snap) => {
  listEl.innerHTML = "";

  if (snap.empty) {
    listEl.innerHTML = `<p style="color:#9aa4b1;">No announcements posted yet.</p>`;
    return;
  }

  snap.forEach((docSnap) => {
    const a = docSnap.data();
    const id = docSnap.id;

    const title   = a.title || "(No title)";
    const msg     = a.message || "";
    const pinned  = a.pinned ? `<span class="pinned-pill">PINNED</span>` : "";
    const ts      = a.createdAt?.toDate
      ? a.createdAt.toDate().toLocaleString()
      : "—";

    // Block
    const div = document.createElement("div");
    div.className = "ann-item";
    div.innerHTML = `
      <h3>${title} ${pinned}</h3>
      <p>${msg}</p>
      <div class="ts">${ts}</div>

      <div class="ann-actions">
        <button class="ann-btn ann-edit" data-id="${id}">Edit</button>
        <button class="ann-btn ann-delete" data-id="${id}">Delete</button>
      </div>
    `;

    listEl.appendChild(div);
  });
});

// Coach actions: edit + delete
listEl.addEventListener("click", async (e) => {
  // DELETE
  if (e.target.classList.contains("ann-delete")) {
    const id = e.target.dataset.id;
    const ok = confirm("Delete this announcement?");
    if (!ok) return;
    await deleteDoc(doc(db, "announcements", id));
    return;
  }

  // EDIT
  if (e.target.classList.contains("ann-edit")) {
    const id = e.target.dataset.id;

    const snap = await getDoc(doc(db, "announcements", id));
    if (!snap.exists()) return;

    const data = snap.data();

    const newTitle = prompt("Edit title:", data.title);
    const newMsg   = prompt("Edit message:", data.message);

    if (newTitle !== null && newMsg !== null) {
      await updateDoc(doc(db, "announcements", id), {
        title: newTitle.trim(),
        message: newMsg.trim()
      });
    }
  }
});
