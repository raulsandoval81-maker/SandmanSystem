// ------------------------------------------------------------
// announcements.js — Coach posts announcements (PILOT MODE)
// ------------------------------------------------------------

import {
  db,
  collection,
  addDoc,
  serverTimestamp
} from "/data/firebase-init.js";

const titleEl  = document.getElementById("ann-title");
const bodyEl   = document.getElementById("ann-body");
const pinnedEl = document.getElementById("ann-pinned");
const btnPost  = document.getElementById("btn-post");
const successMsg = document.getElementById("ann-success");

btnPost.addEventListener("click", async () => {
  const title = titleEl.value.trim();
  const message = bodyEl.value.trim();
  const pinned = pinnedEl.checked;

  // Basic validation
  if (!title || !message) {
    alert("Please enter a title and a message.");
    return;
  }

  try {
    await addDoc(collection(db, "announcements"), {
      title,
      message,
      pinned,
      createdAt: serverTimestamp()
    });

    // Success
    successMsg.style.display = "block";

    // Clear form
    titleEl.value = "";
    bodyEl.value = "";
    pinnedEl.checked = false;

    // Hide success message after 2 seconds
    setTimeout(() => successMsg.style.display = "none", 2000);

    // Optional auto-redirect:
    // setTimeout(() => window.location.href = "/communications/announcements.html", 600);

  } catch (err) {
    console.error("Error posting announcement:", err);
    alert("Error posting announcement. Check console for details.");
  }
});
