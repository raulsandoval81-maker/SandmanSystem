// ------------------------------------------------------------
// Parent Message Thread — Receipt View (Pilot Mode)
// ------------------------------------------------------------
import {
  db,
  doc,
  getDoc,
  updateDoc,
  collection,
  addDoc,
  serverTimestamp,
  onSnapshot
} from "/data/firebase-init.js";

// ------------------------------------------------------------
// URL PARAMS
// ------------------------------------------------------------
const params = new URLSearchParams(location.search);
const id = params.get("id");

const threadEl    = document.querySelector("#thread");
const replyInput  = document.querySelector("#reply-text");
const replyBtn    = document.querySelector("#reply-send");
const successMsg  = document.querySelector("#reply-success");

if (!id) {
  threadEl.innerHTML = "<p>Missing message ID.</p>";
  throw new Error("No ID found.");
}

// ------------------------------------------------------------
// GROUPING STATE
// ------------------------------------------------------------
let lastSender = null;
let lastTimestamp = 0;
const GROUP_WINDOW_MS = 2 * 60 * 1000; // 2 minutes

// ------------------------------------------------------------
// FINAL UNIFIED RENDERER (Level 3 – Grouped Messages)
// ------------------------------------------------------------
function appendMessage({ from, text, ts }) {
  const sender = from === "coach" ? "Coach" : "You";
  const isCoach = (from === "coach");
  const timeVal = ts ? ts.getTime() : Date.now();

  const sameSender = (sender === lastSender);
  const closeInTime = (timeVal - lastTimestamp <= GROUP_WINDOW_MS);

  let groupEl;

  // REUSE LAST GROUP?
  if (sameSender && closeInTime) {
    const groups = threadEl.querySelectorAll(".msg-group");
    groupEl = groups[groups.length - 1];
  } else {
    groupEl = document.createElement("div");
    groupEl.className = `msg-group ${isCoach ? "coach" : "parent"}`;

    const fromLabel = document.createElement("div");
    fromLabel.className = "group-from";
    fromLabel.textContent = sender;

    groupEl.appendChild(fromLabel);
    threadEl.appendChild(groupEl);
  }

  // BUBBLE
  const bubble = document.createElement("div");
  bubble.className = "msg-bubble";
  bubble.textContent = text;

  // Optional timestamp under bubble
  const stamp = document.createElement("div");
  stamp.className = "msg-stamp";
  stamp.textContent = ts ? ts.toLocaleString() : "";

  const wrap = document.createElement("div");
  wrap.className = "bubble-wrap";
  wrap.appendChild(bubble);
  wrap.appendChild(stamp);

  groupEl.appendChild(wrap);

  lastSender = sender;
  lastTimestamp = timeVal;
}

// ------------------------------------------------------------
// LOAD ORIGINAL + LISTEN LIVE
// ------------------------------------------------------------
async function loadThread() {
  const msgRef = doc(db, "paraCoachInbox", id);
  const snap = await getDoc(msgRef);

  if (!snap.exists()) {
    threadEl.innerHTML = "<p>Message not found.</p>";
    return;
  }

  const msg = snap.data();

  // --------- ORIGINAL MESSAGE ALWAYS FIRST ---------
  appendMessage({
    from: "parent",
    text: msg.body,
    ts: msg.createdAt?.toDate() || new Date()
  });

  // --------- REALTIME LISTENER ----------
  const threadRef = collection(msgRef, "thread");

  onSnapshot(threadRef, (qs) => {
    // reset thread
    threadEl.innerHTML = "";

    lastSender = null;
    lastTimestamp = 0;

    // re-render original first
    appendMessage({
      from: "parent",
      text: msg.body,
      ts: msg.createdAt?.toDate() || new Date()
    });

    // then render replies in correct order
    qs.docs
      .map(d => d.data())
      .sort((a, b) => {
        const ta = a.createdAt?.toMillis?.() || 0;
        const tb = b.createdAt?.toMillis?.() || 0;
        return ta - tb;
      })
      .forEach(m => {
        appendMessage({
          from: m.from || "parent",
          text: m.body,
          ts: m.createdAt?.toDate() || new Date()
        });
      });

    threadEl.scrollTop = threadEl.scrollHeight;
  });
}

loadThread();

// ------------------------------------------------------------
// SEND REPLY
// ------------------------------------------------------------
replyBtn.addEventListener("click", async () => {
  const text = replyInput.value.trim();
  if (!text) return;

  const ref = collection(db, "paraCoachInbox", id, "thread");

  await addDoc(ref, {
    from: "parent",
    body: text,
    createdAt: serverTimestamp()
  });

  replyInput.value = "";

  successMsg.style.display = "block";
  setTimeout(() => successMsg.style.display = "none", 1500);
});
