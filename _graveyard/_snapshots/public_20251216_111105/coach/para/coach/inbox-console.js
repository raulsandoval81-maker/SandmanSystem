import {
  db,
  collection,
  query,
  orderBy,
  onSnapshot,
  getDocs
} from "/data/firebase-init.js";

// Parent threads live here:
const threadsCol = collection(db, "parentThreads");
const threadsBox = document.getElementById("threads");

function formatTime(ts) {
  if (!ts) return "";
  const date = ts.toDate();
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
}

function renderThreadCard(id, data) {
  const unread = data.unreadForCoach ? data.unreadForCoach : 0;

  return `
    <div class="thread-card" onclick="location.href='/communications/coach/inbox-view.html?id=${id}'">
      <div class="thread-header">
        <div class="thread-name">${data.parentName || "Parent"}</div>
        ${unread > 0 ? `<div class="unread-badge">${unread}</div>` : ""}
      </div>

      <div class="thread-preview">
        ${data.lastMessage || "<em>No messages yet</em>"}
      </div>

      <div class="thread-time">${formatTime(data.updatedAt)}</div>
    </div>
  `;
}

// Live listener on all threads
onSnapshot(
  query(threadsCol, orderBy("updatedAt", "desc")),
  (snapshot) => {
    threadsBox.innerHTML = "";

    snapshot.forEach((doc) => {
      const data = doc.data();
      threadsBox.innerHTML += renderThreadCard(doc.id, data);
    });

    if (!snapshot.empty) return;

    threadsBox.innerHTML = `
      <p style="color:#9aa4b1;font-size:.9rem;margin-top:20px;">
        No parent messages yet.
      </p>
    `;
  }
);
