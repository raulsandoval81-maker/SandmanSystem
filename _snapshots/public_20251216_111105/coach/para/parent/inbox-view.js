import {
  db,
  doc,
  getDoc,
  updateDoc,
  arrayUnion,
  serverTimestamp
} from "/data/firebase-init.js";

const params = new URLSearchParams(location.search);
const id = params.get("id");

const threadEl = document.querySelector("#thread");
const replyBtn = document.querySelector("#reply-send");
const replyInput = document.querySelector("#reply-text");
const successMsg = document.querySelector("#reply-success");

if (!id) {
  threadEl.innerHTML = "<p>Missing message ID.</p>";
  throw new Error("No ID found in URL");
}

// ---------------------------------------------
// Load the message thread for coach
// ---------------------------------------------
async function loadThread() {
  const ref = doc(db, "paraCoachInbox", id);
  const snap = await getDoc(ref);

  if (!snap.exists()) {
    threadEl.innerHTML = "<p>Message not found.</p>";
    return;
  }

  const data = snap.data();

  // Original message from parent
  appendMessage({
    from: "parent",
    text: data.body,
    ts: data.createdAt?.toDate()
  });

  // Replies
  if (Array.isArray(data.thread)) {
    for (const msg of data.thread) {
      appendMessage({
        from: msg.from,
        text: msg.text,
        ts: msg.ts?.toDate()
      });
    }
  }

  // Mark as seen
  updateDoc(ref, { seen: true }).catch(() => {});
}

loadThread();

// ---------------------------------------------
// Render one bubble
// ---------------------------------------------
function appendMessage({ from, text, ts }) {
  const wrap = document.createElement("div");
  const cls = from === "coach" ? "coach-msg" : "parent-msg";

  wrap.className = `thread-msg ${cls}`;
  wrap.innerHTML = `
    <div>${text}</div>
    <div class="msg-meta">
      ${from === "coach" ? "Coach" : "Parent"} • ${ts ? ts.toLocaleString() : ""}
    </div>
  `;

  threadEl.appendChild(wrap);
}

// ---------------------------------------------
// Send reply (COACH → PARENT)
// ---------------------------------------------
replyBtn.addEventListener("click", async () => {
  const text = replyInput.value.trim();
  if (!text) return;

  const ref = doc(db, "paraCoachInbox", id);

  await updateDoc(ref, {
    thread: arrayUnion({
      from: "coach",
      text,
      ts: serverTimestamp()
    })
  });

  // Add to UI instantly
  appendMessage({
    from: "coach",
    text,
    ts: new Date()
  });

  replyInput.value = "";
  successMsg.style.display = "block";
  setTimeout(() => (successMsg.style.display = "none"), 1500);
});
