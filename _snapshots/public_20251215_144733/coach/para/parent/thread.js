import {
  initializeApp
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";

import {
  getFirestore,
  doc,
  getDoc,
  collection,
  getDocs,
  query,
  orderBy
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

/* -----------------------------------------
   FIREBASE
----------------------------------------- */
const firebaseConfig = {
  apiKey: "AIzaSyDr8fZgWVCP_qBu2Ev9E2KtVay3lJcWJs4",
  authDomain: "sandmandashboard.firebaseapp.com",
  projectId: "sandmandashboard",
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

/* -----------------------------------------
   DOM
----------------------------------------- */
const originalBox = document.getElementById("original");
const threadHolder = document.getElementById("thread-holder");
const btnReply = document.getElementById("btn-reply");
const btnBack  = document.getElementById("btn-back");

/* -----------------------------------------
   PARAMS
----------------------------------------- */
const params   = new URLSearchParams(window.location.search);
const monthKey = params.get("month");
const msgId    = params.get("id");

/* -----------------------------------------
   LOAD ORIGINAL
----------------------------------------- */
async function loadOriginal() {
  const ref = doc(db, `parentInbox/${monthKey}/entries/${msgId}`);
  const snap = await getDoc(ref);

  if (!snap.exists()) {
    originalBox.textContent = "Message not found.";
    return;
  }

  const d = snap.data();
  originalBox.textContent = d.message || "(no message)";
}

/* -----------------------------------------
   LOAD THREAD (Ordered)
----------------------------------------- */
async function loadThread() {
  try {
    const col = collection(db, `parentInbox/${monthKey}/entries/${msgId}/thread`);
    const q = query(col, orderBy("createdAt", "asc"));
    const snaps = await getDocs(q);

    threadHolder.innerHTML = "";

    snaps.forEach(docSnap => {
      const d = docSnap.data();
      const side = d.from === "Coach" ? "from-coach" : "from-parent";

      const bubble = document.createElement("div");
      bubble.className = `bubble ${side}`;
      bubble.textContent = d.text;

      const ts = document.createElement("div");
      ts.className = "ts";
      ts.textContent = d.createdAt?.toDate().toLocaleString() || "";

      threadHolder.appendChild(bubble);
      threadHolder.appendChild(ts);
    });

    // Scroll to bottom
    threadHolder.scrollTop = threadHolder.scrollHeight;

  } catch (err) {
    threadHolder.textContent = "Error loading thread.";
  }
}

/* -----------------------------------------
   BUTTONS
----------------------------------------- */
btnReply.addEventListener("click", () => {
  window.location.href = `./reply.html?month=${monthKey}&id=${msgId}`;
});

btnBack.addEventListener("click", () => {
  window.location.href = "./inbox.html";
});

/* -----------------------------------------
   RUN
----------------------------------------- */
loadOriginal();
loadThread();
