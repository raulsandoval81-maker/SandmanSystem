import { db } from "./firebase.js";
import { db, collection, getDocs, query, orderBy } from "/data/firebase-init.js";

// ---------------------------
// Helpers
// ---------------------------
function formatDate(date) {
  return date.toLocaleString("en-US", { month: "short", day: "numeric" });
}

function daysFromNow(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d;
}

// ---------------------------
// Compute Ranges
// ---------------------------
const today = new Date();
const pastStart = daysFromNow(-14);
const pastEnd   = daysFromNow(-1);

const presentStart = daysFromNow(0);
const presentEnd   = daysFromNow(+13);

const futureStart  = daysFromNow(+14);
const futureEnd    = daysFromNow(+28);

// Apply headers
document.getElementById("past-range").textContent =
  `Last Two Weeks (${formatDate(pastStart)} – ${formatDate(pastEnd)})`;

document.getElementById("present-range").textContent =
  `This Week + Next (${formatDate(presentStart)} – ${formatDate(presentEnd)})`;

document.getElementById("future-range").textContent =
  `Coming Up (${formatDate(futureStart)} – ${formatDate(futureEnd)})`;

// ---------------------------
// Load Posts
// ---------------------------
async function loadPosts() {
  const ref = collection(db, "bulletin", "2025-11", "entries");
  const q = query(ref, orderBy("timestamp", "desc"));
  const snap = await getDocs(q);

  snap.forEach(doc => {
    const data = doc.data();
    const ts = data.timestamp?.toDate?.() || new Date();

    let target = null;

    if (ts >= pastStart && ts <= pastEnd) {
      target = document.getElementById("past-list");
    }
    else if (ts >= presentStart && ts <= presentEnd) {
      target = document.getElementById("present-list");
    }
    else if (ts >= futureStart && ts <= futureEnd) {
      target = document.getElementById("future-list");
    }

    if (target) {
      const div = document.createElement("div");
      div.classList.add("post-item");
      div.innerHTML = `
        <h3>${data.subject}</h3>
        <p>${data.en}</p>
        <p class="es">${data.es}</p>
        <span class="ts">${formatDate(ts)}</span>
      `;
      target.appendChild(div);
    }
  });
}

loadPosts();
