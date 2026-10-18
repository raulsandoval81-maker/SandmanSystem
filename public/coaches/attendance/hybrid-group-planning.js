import { resolveRoad2ChampionWrestlingTierWaves } from "/assets/js/hybrid/youth/road2champion-wrestling-tier-wave-policy.js";
import { normalizePlanningSources, editableGroupPlanning } from "/coaches/execution/session-builder/hybrid-planning-policy.js";

const escape = (value) => String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const sources = ["tierWaves", "systemSuggestions", "coachInput"];
const labels = {
  tierWaves: "Tier Waves — approved curriculum and Coach Cards",
  systemSuggestions: "System Suggestions — unavailable pending authoritative history",
  coachInput: "Coach Input / Pass It Forward"
};

export function renderAttendanceHybridPlanning(host, groups, state, onChange) {
  if (!host) return;
  const options = normalizePlanningSources(state.planningSources || {}, "hybrid");
  host.hidden = false;
  host.innerHTML = `<h3>HYBRID — Plan instruction after check-in</h3>
    <p>Choose lesson sources and review the curriculum for each confirmed group. Final acceptance occurs before Clipboard.</p>
    <div class="hybrid-attendance-sources">${sources.map(key => `<label style="display:block;padding:8px 0"><input type="checkbox" data-hybrid-source="${key}" ${options[key] ? "checked" : ""}> ${labels[key]}</label>`).join("")}</div>
    <div class="hybrid-attendance-groups"></div>`;
  const body = host.querySelector(".hybrid-attendance-groups");
  for (const group of groups) {
    if (!group.athleteIds?.length) continue;
    const prior = editableGroupPlanning(state.groupPlanning?.[group.id] || {}, group);
    const youthWrestling = String(group.journey).toUpperCase() === "Z2H" && String(group.discipline).toLowerCase() === "wrestling";
    const placement = youthWrestling ? resolveRoad2ChampionWrestlingTierWaves(group.tier) : null;
    const waves = Object.entries(placement?.waves || {}).filter(([, cards]) => Array.isArray(cards) && cards.length);
    const selected = waves.some(([key]) => key === prior.selectedWave) ? prior.selectedWave : "";
    const cards = waves.find(([key]) => key === selected)?.[1] || [];
    const section = document.createElement("section");
    section.className = "attendance-card hybrid-group-card";
    section.dataset.groupId = group.id;
    section.innerHTML = `<h4>${escape(group.label)} · ${escape(group.journey)} · ${escape(group.tier || "Focus required")}</h4>
      <p>${escape(group.athleteNames?.join(", ") || "")}</p>
      ${options.tierWaves ? (waves.length ? `<label>Tier Wave <select class="attendance-hybrid-wave">
        <option value="">Select a Tier Wave</option>
        ${waves.map(([key]) => `<option value="${escape(key)}" ${key === selected ? "selected" : ""}>${escape(key.replaceAll("_"," "))}</option>`).join("")}
      </select></label><div>${cards.map(card => `<a target="_blank" rel="noopener noreferrer" href="${escape(card.href)}">${escape(card.title)}</a>`).join(" · ")}</div>` :
        "<p>Tier Wave mapping unavailable here. Review this group's curriculum in Session Builder.</p>") : ""}
      ${options.systemSuggestions ? "<p>System Suggestions unavailable until verified athlete history is connected.</p>" : ""}
      ${options.coachInput ? `<label>Coach instructions <textarea class="attendance-hybrid-note" rows="3">${escape(prior.currentNote)}</textarea></label>` : ""}
      <p>Instructional content only — no verified progression or XP.</p>`;
    body.append(section);
    section.querySelector(".attendance-hybrid-wave")?.addEventListener("change", event => {
      state.groupPlanning[group.id] = { ...(state.groupPlanning[group.id] || {}), selectedWave: event.target.value,
        instructionalTier: String(group.tier || "").toLowerCase() };
      onChange(true);
    });
    section.querySelector(".attendance-hybrid-note")?.addEventListener("input", event => {
      state.groupPlanning[group.id] = { ...(state.groupPlanning[group.id] || {}),
        currentNote: event.target.value, instructionalTier: String(group.tier || "").toLowerCase(),
        disposition: "replaced" };
      onChange();
    });
  }
  host.querySelectorAll("[data-hybrid-source]").forEach(input => input.addEventListener("change", () => {
    state.planningSources = Object.fromEntries([...host.querySelectorAll("[data-hybrid-source]")].map(el => [el.dataset.hybridSource, el.checked]));
    onChange(true);
  }));
}
