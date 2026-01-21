// coach/tournament.js
console.log("[Tournament] coach tool loaded");

const $ = id => document.getElementById(id);
const statusEl = $("status");

function setStatus(msg, cls="text-warn") {
  if (!statusEl) return;
  statusEl.className = `status ${cls}`;
  statusEl.textContent = msg;
}

document.addEventListener("DOMContentLoaded", () => {
  setStatus("Tournament tool placeholder active.");

  $("saveBracket")?.addEventListener("click", () => {
    const url = $("bracketUrl")?.value?.trim();
    if (!url) return;
    const li = document.createElement("div");
    li.innerHTML = `<a href="${url}" target="_blank" rel="noopener">Bracket</a>`;
    $("bracketList")?.prepend(li);
    $("bracketUrl").value = "";
  });

  $("saveRunSheet")?.addEventListener("click", () => {
    setStatus("Run sheet saved (local only).", "text-ok");
  });
});
