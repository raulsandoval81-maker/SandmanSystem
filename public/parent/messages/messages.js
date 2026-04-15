function paintParentMessages(lang){
  const showEN = (lang === "en");

  document.querySelectorAll(".en").forEach(el => {
    el.style.display = showEN ? "" : "none";
  });

  document.querySelectorAll(".es").forEach(el => {
    el.style.display = showEN ? "none" : "";
  });
}

const langButtons = document.querySelectorAll(".parent-lang-btn");

function setLang(lang){
  localStorage.setItem("lang", lang);

  langButtons.forEach(btn => {
    btn.classList.toggle("active", btn.dataset.lang === lang);
  });

  paintParentMessages(lang);
}

document.addEventListener("DOMContentLoaded", () => {
  const saved = localStorage.getItem("lang") || "en";
  setLang(saved);

  langButtons.forEach(btn => {
    btn.addEventListener("click", () => setLang(btn.dataset.lang));
  });
});
import {
  db,
  collection,
  query,
  where,
  getDocs
} from "/assets/js/firebase-init-para.js";

const listEl = document.getElementById("messages-list"); // container in HTML

async function loadThreads(parentUid){
  if (!parentUid || !listEl) return;

  const q = query(
    collection(db, "paraParentInbox"),
    where("parentUid", "==", parentUid)
  );

  const snap = await getDocs(q);

  const rows = [];

  snap.forEach(doc => {
    const data = doc.data();

    // 🔒 FILTER RULES
    if (data.status !== "active") return;
    if ((data.messageCount || 0) >= 12) return;

    rows.push({
      id: doc.id,
      ...data
    });
  });

  renderThreads(rows);
}

function renderThreads(rows){
  if (!rows.length){
    listEl.innerHTML = `
      <div class="empty">
        No active conversations.
      </div>
    `;
    return;
  }

  listEl.innerHTML = rows.map(row => `
    <div class="thread-card" onclick="openThread('${row.id}')">
      <div class="thread-title">${row.subject || "Conversation"}</div>
      <div class="thread-preview">${row.lastBody || ""}</div>
    </div>
  `).join("");
}

function openThread(id){
  window.location.href = `/parent/thread.html?id=${id}`;
}