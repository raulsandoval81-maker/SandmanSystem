// ------------------------------------------------------------
// Unified Announcement Feed (Parent + Coach)
// Order: pinned first, then newest
// Limit: 10
// Live updates via onSnapshot
// ------------------------------------------------------------

import {
  db,
  collection,
  query,
  orderBy,
  limit,
  onSnapshot
} from "/data/firebase-init.js";

const list = document.getElementById("announcement-list");

function render(doc) {
  const data = doc.data();
  const stamp = data.createdAt?.toDate().toLocaleString("en-US");

  const wrapper = document.createElement("div");
  wrapper.className = "card";

  wrapper.innerHTML = `
    <h2 class="title">
      ${data.title}
      ${data.pinned ? `<span class="pinned">📌 Pinned</span>` : ""}
    </h2>

    <div class="body">${data.message}</div>

    <div class="stamp">${stamp}</div>
  `;

  return wrapper;
}

// Query pinned first → then by createdAt (desc)
const q = query(
  collection(db, "announcements"),
  orderBy("pinned", "desc"),
  orderBy("createdAt", "desc"),
  limit(10)
);

onSnapshot(q, snap => {
  list.innerHTML = "";
  snap.forEach(doc => list.appendChild(render(doc)));
});
