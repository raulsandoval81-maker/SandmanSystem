// -------------------------------------------------------
// inbox-view.js — Dual Mode + Final Upgrade Pack
// -------------------------------------------------------

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import {
  getFirestore,
  doc,
  getDoc,
  collection,
  getDocs,
  addDoc,
  updateDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// Firebase Config
const firebaseConfig = {
  apiKey: "AIzaSyDr8fZgWVCP_qBu2Ev9E2KtVay3lJcWJs4",
  authDomain: "sandmandashboard.firebaseapp.com",
  projectId: "sandmandashboard",
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// -------------------------------------------------------
// Detect mode: Parent or Coach
// -------------------------------------------------------
const IS_COACH = location.pathname.includes("/coach/");

// -------------------------------------------------------
// UI Elements
// -------------------------------------------------------
const threadContainer = document.getElementById("thread-container");

// Coach controls
const replyBox     = document.querySelector(".reply-box");
const replyInput   = document.getElementById("reply-body");
const replyBtn     = document.getElementById("btn-send-reply");
const replySuccess = document.getElementById("reply-success");
const replyError   = document.getElementById("reply-error");

if (!IS_COACH && replyBox) replyBox.style.display = "none";

// -------------------------------------------------------
// Parse URL
// -------------------------------------------------------
const url = new URL(window.location.href);
const msgId = url.searchParams.get("id");
const month = url.searchParams.get("month");

if (!msgId || !month) {
  threadContainer.innerHTML = "<p>Error: Missing thread ID.</p>";
  throw new Error("Missing id or month");
}

// -------------------------------------------------------
// Firestore Paths
// -------------------------------------------------------
const parentMsgRef = doc(db, `parentInbox/${month}/entries/${msgId}`);
const threadColRef = collection(db, `parentInbox/${month}/entries/${msgId}/thread`);


// -------------------------------------------------------
// Timestamp Divider Helpers
// -------------------------------------------------------
function makeDivider(label){
  return `
    <div style="
      text-align:center;
      margin:16px 0;
      font-size:.75rem;
      color:#94a3b8;
      letter-spacing:.05em;
    ">— ${label} —</div>
  `;
}

function dividerFor(date){
  if (!date) return null;
  const d = new Date(date);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);

  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";

  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric"
  });
}

// -------------------------------------------------------
// AVATAR + MESSAGE BUILDER
// -------------------------------------------------------
function makeAvatar(name, isCoach){
  const initial = (name || "?").charAt(0).toUpperCase();
  const bg = isCoach ? "#1e3a5f" : "#4b5563";
  return `
    <div style="
      width:36px;height:36px;border-radius:50%;
      background:${bg};color:#ffdd48;
      display:flex;align-items:center;justify-content:center;
      font-weight:800;font-size:1rem;
    ">${initial}</div>
  `;
}

function buildThreadMessage(msg){
  const isCoach = msg.from === "coach";
  const avatarHTML = makeAvatar(msg.fromName, isCoach);

  const deliveredHTML = isCoach
    ? `<div style="color:#64748b;font-size:.7rem;margin-top:4px;">Delivered</div>`
    : "";

  return `
    <div class="thread-msg ${isCoach ? "coach" : "parent"}">
      <div style="display:flex; align-items:flex-start; gap:12px;">
        ${avatarHTML}
        <div>
          <div class="from">${escapeHTML(msg.fromName)}</div>
          <div class="timestamp">${msg.createdAt}</div>
          <div class="body">${escapeHTML(msg.body)}</div>
          ${deliveredHTML}
        </div>
      </div>
    </div>
  `;
}

// -------------------------------------------------------
// UTIL
// -------------------------------------------------------
function escapeHTML(str=""){ return str.replace(/[&<>'"]/g, c => ({
  "&":"&amp;", "<":"&lt;", ">":"&gt;",
  "'":"&#39;", '"':"&quot;"
}[c])); }

function safeDate(ts){
  return ts?.toDate ? ts.toDate().toLocaleString() : "";
}

// -------------------------------------------------------
// LOAD THREAD
// -------------------------------------------------------
async function loadThread() {
  const msgSnap = await getDoc(parentMsgRef);
  if (!msgSnap.exists()) {
    threadContainer.innerHTML = "<p>Message not found.</p>";
    return;
  }

  const msg = msgSnap.data();

  // Coach → mark unread as read
  if (IS_COACH && msg.unread) {
    await updateDoc(parentMsgRef, { unread: false });
  }

  let html = "";
  let lastDivider = null;

  // ----- Parent message -----
  const parentDivider = dividerFor(msg.createdAt?.toDate());
  if (parentDivider) lastDivider = parentDivider;
  html += makeDivider(parentDivider);

  html += buildThreadMessage({
    from: "parent",
    fromName: msg.parentName || "Parent",
    body: msg.message || msg.body_en || "",
    createdAt: safeDate(msg.createdAt),
  });

  // ----- Replies -----
  const snap = await getDocs(threadColRef);
  const replies = [];
  snap.forEach((d) => replies.push(d.data()));

  replies.sort((a,b)=>(a.createdAt?.toMillis?.()||0)-(b.createdAt?.toMillis?.()||0));

  for (const r of replies){
    const lbl = dividerFor(r.createdAt?.toDate?.());
    if (lbl && lbl !== lastDivider){
      html += makeDivider(lbl);
      lastDivider = lbl;
    }

    html += buildThreadMessage({
      from: r.from || "coach",
      fromName: r.fromName || "Coach",
      body: r.body || r.text || "",
      createdAt: safeDate(r.createdAt),
    });
  }

  threadContainer.innerHTML = html;

  // Smooth scroll
  setTimeout(() => {
    window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });
  }, 80);
}

loadThread();

// -------------------------------------------------------
// COACH REPLY
// -------------------------------------------------------
if (IS_COACH && replyBtn) {
  replyBtn.addEventListener("click", async () => {
    replySuccess.style.display = "none";
    replyError.style.display = "none";

    const text = replyInput.value.trim();
    if (!text) return;

    try {
      await addDoc(threadColRef, {
        body: text,
        from: "coach",
        fromName: "Coach",
        createdAt: serverTimestamp()
      });

      await updateDoc(parentMsgRef, {
        unread: true,
        lastReplyAt: serverTimestamp()
      });

      replyInput.value = "";
      replySuccess.style.display = "block";
      setTimeout(()=>replySuccess.style.display="none",1500);

      loadThread();
    } catch (err){
      console.error(err);
      replyError.style.display = "block";
    }
  });
}
