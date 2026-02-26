// placeholder-tournament.js — v2 (local-only; wiring-first)
// Safe to drop-in replace. No Firebase writes yet.

console.log("[Tournament] placeholder v2 loaded");

// ---------- helpers ----------
const $ = (id) => document.getElementById(id);
const statusEl = $("status");
function setStatus(msg, cls = "text-warn") {
  if (!statusEl) return;
  statusEl.className = `status ${cls}`;
  statusEl.textContent = msg;
}
const lsKey = (k) => `sandman.tournament.${k}`;
const saveLS = (k, v) => localStorage.setItem(lsKey(k), JSON.stringify(v));
const readLS = (k, fallback) => {
  try { return JSON.parse(localStorage.getItem(lsKey(k))) ?? fallback; }
  catch { return fallback; }
};

// ---------- local state ----------
const state = {
  brackets: readLS("brackets", []), // [{href, at}]
  runSheet: readLS("runSheet", ""), // string
  postNotes: readLS("postNotes", ""), // string
};

// ---------- renderers ----------
function renderBrackets() {
  const box = $("bracketList");
  if (!box) return;
  if (!state.brackets.length) { box.innerHTML = "None yet."; return; }
  box.innerHTML = "";
  state.brackets
    .slice().reverse()
    .forEach((b, i) => {
      const el = document.createElement("div");
      el.className = "row";
      el.style.gap = "8px";
      el.innerHTML = `
        <a href="${b.href}" target="_blank" rel="noopener">Bracket link</a>
        <span class="muted">· ${new Date(b.at).toLocaleString()}</span>
        <button class="btn btn-small btn-secondary" data-del="${i}">Remove</button>
      `;
      box.appendChild(el);
    });

  // delete buttons
  box.querySelectorAll("[data-del]").forEach(btn => {
    btn.addEventListener("click", () => {
      const idxFromEnd = Number(btn.getAttribute("data-del"));
      // because we reversed on render, map index back
      const idx = state.brackets.length - 1 - idxFromEnd;
      state.brackets.splice(idx, 1);
      saveLS("brackets", state.brackets);
      setStatus("Removed bracket link.", "text-ok");
      renderBrackets();
    });
  });
}

function hydrateTextAreas() {
  const rs = $("runSheet");
  const pn = $("postNotes");
  if (rs) rs.value = state.runSheet || "";
  if (pn) pn.value = state.postNotes || "";
}

// ---------- downloads ----------
function downloadTxt(filename, content) {
  const blob = new Blob([content], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

// ---------- simple upgrade hooks (future Firebase) ----------
const adapter = {
  // Replace these later with real Firestore/Functions calls:
  async saveRunSheet(text) { /* no-op in placeholder */ return { ok: true }; },
  async savePostNotes(text) { /* no-op in placeholder */ return { ok: true }; },
  async saveBracketLink(href) { /* no-op in placeholder */ return { ok: true }; },
};
export function setTournamentAdapter(custom) {
  Object.assign(adapter, custom || {});
}

// ---------- init & events ----------
document.addEventListener("DOMContentLoaded", () => {
  setStatus("Placeholder (wired, not saving yet).");
  hydrateTextAreas();
  renderBrackets();

  // Export static checklist
  $("exportChecklist")?.addEventListener("click", () => {
    const txt = [
      "Tournament Pre-Event Checklist",
      "- Roster & eligibility",
      "- Waivers / forms",
      "- Weights & divisions",
      "- Travel plan",
      "- Coach assignments / corners"
    ].join("\n");
    downloadTxt("tournament-checklist.txt", txt);
  });

  // Brackets
  $("saveBracket")?.addEventListener("click", async () => {
    const url = $("bracketUrl")?.value?.trim();
    if (!url) return;
    state.brackets.push({ href: url, at: Date.now() });
    saveLS("brackets", state.brackets);
    await adapter.saveBracketLink(url);
    $("bracketUrl").value = "";
    renderBrackets();
    setStatus("Bracket link saved (local only in placeholder).", "text-ok");
  });

  // Run sheet
  $("saveRunSheet")?.addEventListener("click", async () => {
    const txt = $("runSheet")?.value || "";
    state.runSheet = txt;
    saveLS("runSheet", txt);
    await adapter.saveRunSheet(txt);
    setStatus("Run sheet saved (local only in placeholder).", "text-ok");
  });

  $("downloadRunSheet")?.addEventListener("click", () => {
    const txt = $("runSheet")?.value || "";
    downloadTxt("run-sheet.txt", txt);
  });

  // Post-event notes
  $("savePostNotes")?.addEventListener("click", async () => {
    const txt = $("postNotes")?.value || "";
    state.postNotes = txt;
    saveLS("postNotes", txt);
    await adapter.savePostNotes(txt);
    setStatus("Post-event notes saved (local only in placeholder).", "text-ok");
  });

  // (Optional) Open roster from this page
  $("openRoster")?.addEventListener("click", () => {
    // keep it simple for now; you already have coaches/roster.html
    window.location.href = "roster.html";
  });

  // Search (stub) — you can wire weigh-ins table later
  $("weighSearch")?.addEventListener("input", () => {
    // placeholder only
    const q = $("weighSearch").value.trim();
    $("weighTable").textContent = q ? `Search: “${q}” (placeholder)` : "No data (placeholder).";
  });
});
