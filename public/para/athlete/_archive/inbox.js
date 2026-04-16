import { ensureSignedIn } from "/assets/js/firebase-init-para.js";
await ensureSignedIn();

const uidEl   = document.getElementById("ath-uid");
const btnOpen = document.getElementById("btn-open");
const listEl  = document.getElementById("thread-list");

function normEmail(s="") {
  return String(s).trim().toLowerCase();
}

function openThread() {
  // For V1: ath-uid box is repurposed to hold parent email threadId
  const threadId = normEmail(uidEl?.value || "");
  if (!threadId) return alert("Enter parent email (thread id).");
  location.href = `/para/athlete/thread.html?id=${encodeURIComponent(threadId)}`;
}

btnOpen?.addEventListener("click", (e) => {
  e.preventDefault();
  openThread();
});

// ENTER key support
uidEl?.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    openThread();
  }
});

if (listEl) {
  listEl.innerHTML = `<div style="opacity:.7;">V1: Athlete view is read-only. Open by parent email (thread id).</div>`;
}