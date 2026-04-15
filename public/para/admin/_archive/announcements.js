// ------------------------------------------------------------
// announcements.js — Coach posts announcements (PILOT MODE)
// PARA LANE (isolated from XP/Intake)
// ------------------------------------------------------------

import {
  db,
  collection,
  addDoc,
  serverTimestamp
} from "/assets/js/firebase-init-para.js";

const titleEl  = document.getElementById("ann-title");
const bodyEl   = document.getElementById("ann-body");
const pinnedEl = document.getElementById("ann-pinned");
const btnPost  = document.getElementById("btn-post");
const successMsg = document.getElementById("ann-success");

btnPost?.addEventListener("click", async () => {
  const title = (titleEl?.value || "").trim();
  const message = (bodyEl?.value || "").trim();
  const pinned = !!pinnedEl?.checked;

  // Basic validation
  if (!title || !message) {
    alert("Please enter a title and a message.");
    return;
  }

  // Simple caps (pilot safety)
  if (title.length > 80) {
    alert("Title too long (max 80 characters).");
    return;
  }
  if (message.length > 1200) {
    alert("Message too long (max 1200 characters).");
    return;
  }

  // Double-click guard
  btnPost.disabled = true;
  const oldLabel = btnPost.textContent;
  btnPost.textContent = "Posting...";

  try {
    await addDoc(collection(db, "paraAnnouncements"), {
      title,
      message,
      pinned,
      createdAt: serverTimestamp(),
      // Optional metadata (safe to add now if you want)
      // from: "coach",
      // fromName: "Coach",
    });

    // Success UI
    if (successMsg) successMsg.style.display = "block";

    // Clear form
    if (titleEl) titleEl.value = "";
    if (bodyEl) bodyEl.value = "";
    if (pinnedEl) pinnedEl.checked = false;

    // Hide success message after 2 seconds
    setTimeout(() => {
      if (successMsg) successMsg.style.display = "none";
    }, 2000);

    // Optional auto-redirect:
    // setTimeout(() => window.location.href = "/coach/para/announcements.html", 600);

  } catch (err) {
    console.error("Error posting announcement:", err);
    alert("Error posting announcement. Check console for details.");
  } finally {
    btnPost.disabled = false;
    btnPost.textContent = oldLabel || "Post";
  }
});