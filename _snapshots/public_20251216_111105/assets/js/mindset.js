// public/assets/js/mindset.js
// Athlete Mindset Tool – safe, standalone, localStorage-backed

const $ = (id) => document.getElementById(id);

// Safe refs (these exist on mindset.html)
const skill      = $("skill");
const lead       = $("lead");
const challenge  = $("challenge");
const nextGoal   = $("nextGoal");
const effort     = $("effort");
const focus      = $("focus");
const confidence = $("confidence");
const saveBtn    = $("saveBtn");
const statusEl   = $("status");
const logList    = $("logList");

// Utilities
const LS_KEY = "mindset_entries_v1";

function loadEntries() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveEntries(arr) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(arr));
  } catch (e) {
    console.warn("[Mindset] Could not save to localStorage:", e);
  }
}

function getEntryFromUI() {
  return {
    ts: Date.now(),
    date: new Date().toLocaleString(),
    skill:      (skill?.value || "").trim(),
    lead:       (lead?.value || "").trim(),
    challenge:  (challenge?.value || "").trim(),
    nextGoal:   (nextGoal?.value || "").trim(),
    effort:     effort?.value || "",
    focus:      focus?.value || "",
    confidence: confidence?.value || ""
  };
}

function renderOne(entry) {
  const div = document.createElement("div");
  div.className = "item";
  div.style.background = "#0e131a";
  div.style.borderRadius = "12px";
  div.style.padding = "10px 12px";
  div.innerHTML = `
    <strong>${entry.date}</strong><br/>
    <em>Skill:</em> ${entry.skill || "—"}<br/>
    <em>Leadership:</em> ${entry.lead || "—"}<br/>
    <em>Challenge:</em> ${entry.challenge || "—"}<br/>
    <em>Next Goal:</em> ${entry.nextGoal || "—"}<br/>
    <em>Effort:</em> ${entry.effort || "—"} |
    <em>Focus:</em> ${entry.focus || "—"} |
    <em>Confidence:</em> ${entry.confidence || "—"}
  `;
  logList?.prepend(div);
}

function renderAll() {
  if (!logList) return;
  logList.innerHTML = "";
  const entries = loadEntries().sort((a,b) => b.ts - a.ts);
  if (!entries.length) {
    logList.classList.add("muted");
    logList.textContent = "No entries yet.";
    return;
  }
  logList.classList.remove("muted");
  entries.forEach(renderOne);
}

function setStatus(msg) {
  if (statusEl) statusEl.textContent = msg;
}

// Event wiring
document.addEventListener("DOMContentLoaded", () => {
  console.log("[Athlete Mindset] JS loaded");
  renderAll();

  saveBtn?.addEventListener("click", () => {
    const entry = getEntryFromUI();

    // basic validation: at least one field filled
    const hasText =
      entry.skill || entry.lead || entry.challenge || entry.nextGoal ||
      entry.effort || entry.focus || entry.confidence;

    if (!hasText) {
      setStatus("Add a note or rating first.");
      return;
    }

    const entries = loadEntries();
    entries.push(entry);
    saveEntries(entries);
    renderOne(entry);
    setStatus("Saved!");

    // soft reset of textareas (keep ratings)
    if (skill) skill.value = "";
    if (lead) lead.value = "";
    if (challenge) challenge.value = "";
    if (nextGoal) nextGoal.value = "";

    setTimeout(() => setStatus("Ready."), 1500);
  });
});
