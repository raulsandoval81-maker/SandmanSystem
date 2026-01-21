// Sandman Timeline (v3) — minimal, safe, and noisy on errors
import { db } from "/public/assets/js/firebase-init.js";
import {
  collection, query, orderBy, limit, getDocs
} from "https://www.gstatic.com/firebasejs/10.12.3/firebase-firestore.js";

// Surface errors instead of silent spinners
window.addEventListener("error",  e => console.error("JS error:", e.error || e.message));
window.addEventListener("unhandledrejection", e => console.error("Promise error:", e.reason));

console.log("xp.timeline.v3.js loaded");

async function renderTimeline() {
  const statusEl = document.getElementById("tl-status");
  const listEl   = document.getElementById("tl-list");
  if (!statusEl || !listEl) {
    console.warn("Timeline containers not found (tl-status / tl-list).");
    return;
  }

  statusEl.textContent = "Loading timeline…";

  try {
    const q = query(
      collection(db, "xp_logs"),
      orderBy("createdAt", "desc"),
      limit(10)
    );
    const snap = await getDocs(q);

    if (snap.empty) {
      statusEl.textContent = "No XP logs yet.";
      listEl.innerHTML = "";
      return;
    }

    statusEl.textContent = "";
    listEl.innerHTML = "";
    snap.forEach(d => {
      const x = d.data();
      const li = document.createElement("li");
      li.textContent = `${x.athleteId || "unknown"} — ${x.category || "XP"} +${x.points || 0} · ${x.dateKey || ""}`;
      listEl.appendChild(li);
    });
  } catch (err) {
    console.error("Timeline load failed:", err);
    const msg =
      (err.code === "permission-denied" && "Permission denied: sign in or relax read rule.") ||
      (err.code === "failed-precondition" && "Missing index: click the console link to create it.") ||
      err.message || String(err);
    statusEl.textContent = `Error: ${msg}`;
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", renderTimeline);
} else {
  renderTimeline();
}
