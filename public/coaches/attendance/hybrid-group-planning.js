import { resolveRoad2ChampionWrestlingTierWaves } from "/assets/js/hybrid/youth/road2champion-wrestling-tier-wave-policy.js";
import { editableGroupPlanning, normalizePlanningSources } from "/coaches/execution/session-builder/hybrid-planning-policy.js";
import { tierWaveEligibility } from "/coaches/attendance/practice-group-policy.js";

const escape = (value) => String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const sources = ["tierWaves", "systemSuggestions", "coachInput"];
const labels = {
  tierWaves: ["Tier Waves", "Approved curriculum and Coach Cards"],
  systemSuggestions: ["System Suggestions", "Unavailable pending authoritative history"],
  coachInput: ["Coach Input / Pass It Forward", "Current instructions and prior carry-forward references"]
};

function sourceSection(key, options, expanded) {
  const [title, description] = labels[key];
  return `<details class="hybrid-source-section" data-hybrid-section="${key}" ${expanded[key] ? "open" : ""}>
    <summary>
      <span><strong>${title}</strong><small>${description}</small></span>
      <input type="checkbox" data-hybrid-source="${key}" aria-label="Use ${title}" ${options[key] ? "checked" : ""}>
    </summary>
    <div class="hybrid-source-content" data-hybrid-content="${key}"></div>
  </details>`;
}

function groupHeading(group) {
  return `<div class="hybrid-planning-group-head"><strong>${escape(group.label)}</strong><span>${escape(group.journey)} · ${escape(group.progressionTierLabel || group.tier || "Tier Unverified")}</span></div>`;
}

export function renderAttendanceHybridPlanning(host, groups, state, onChange) {
  if (!host) return;
  const options = normalizePlanningSources(state.planningSources || {}, "hybrid");
  const expanded = state.expandedSources ||= { tierWaves: true, systemSuggestions: false, coachInput: false };
  host.hidden = false;
  host.innerHTML = `<div class="hybrid-attendance-heading"><h3>HYBRID Instructional Sources</h3>
    <p>Expand a source to review it. Coach accepts the final group lesson before Clipboard.</p></div>
    <div class="hybrid-attendance-sources">${sources.map(key => sourceSection(key, options, expanded)).join("")}</div>`;

  const tierWaveBody = host.querySelector('[data-hybrid-content="tierWaves"]');
  const systemBody = host.querySelector('[data-hybrid-content="systemSuggestions"]');
  const coachBody = host.querySelector('[data-hybrid-content="coachInput"]');
  if (systemBody) {
    systemBody.innerHTML = options.systemSuggestions
      ? '<p class="hybrid-policy-note">System Suggestions remain unavailable until authoritative athlete-history recommendations are connected.</p>'
      : '<p class="hybrid-policy-note">System Suggestions are off for this practice.</p>';
  }

  for (const group of groups) {
    if (!group.athleteIds?.length) continue;
    const prior = editableGroupPlanning(state.groupPlanning?.[group.id] || {}, group);
    const eligibility = tierWaveEligibility(group);
    const youthWrestling = eligibility.eligible && eligibility.journey === "z2h" && String(group.discipline).toLowerCase() === "wrestling";
    const placement = youthWrestling ? resolveRoad2ChampionWrestlingTierWaves(eligibility.tier) : null;
    const waves = Object.entries(placement?.waves || {}).filter(([, cards]) => Array.isArray(cards) && cards.length);
    const selected = waves.some(([key]) => key === prior.selectedWave) ? prior.selectedWave : "";
    const cards = waves.find(([key]) => key === selected)?.[1] || [];

    const tierSection = document.createElement("section");
    tierSection.className = "hybrid-planning-group";
    tierSection.dataset.groupId = group.id;
    const unavailable = !eligibility.eligible
      ? eligibility.message
      : !youthWrestling || !waves.length
        ? "Tier Wave mapping unavailable for this Journey, discipline, or instructional tier. No substitute curriculum was selected."
        : "";
    tierSection.innerHTML = `${groupHeading(group)}
      ${options.tierWaves && !unavailable ? `<label>Approved Tier Wave<select class="attendance-hybrid-wave">
        <option value="">Select a Tier Wave</option>
        ${waves.map(([key]) => `<option value="${escape(key)}" ${key === selected ? "selected" : ""}>${escape(key.replaceAll("_", " "))}</option>`).join("")}
      </select></label><div class="hybrid-wave-links">${cards.map(card => `<a target="_blank" rel="noopener noreferrer" href="${escape(card.href)}">${escape(card.title)}</a>`).join("")}</div>` :
        `<p class="hybrid-policy-note">${escape(options.tierWaves ? unavailable : "Tier Waves are off for this practice.")}</p>`}
      <small>Instructional content only — never verified progression, XP, certification, or promotion evidence.</small>`;
    tierWaveBody?.append(tierSection);

    const coachSection = document.createElement("section");
    coachSection.className = "hybrid-planning-group";
    coachSection.dataset.groupId = group.id;
    coachSection.innerHTML = `${groupHeading(group)}
      ${group.carryForwardNote ? `<div class="carry-forward-reference"><strong>Carry Forward Reference</strong><p>${escape(group.carryForwardNote)}</p></div>` : ""}
      ${options.coachInput ? `<label>Current Coach instructions<textarea class="attendance-hybrid-note" rows="3" placeholder="Optional instructions for this practice">${escape(prior.currentNote)}</textarea></label>` : '<p class="hybrid-policy-note">Coach Input is off for this practice.</p>'}
      <small>Pass It Forward is recorded after practice. Notes here do not certify mastery or change progression.</small>`;
    coachBody?.append(coachSection);

    tierSection.querySelector(".attendance-hybrid-wave")?.addEventListener("change", event => {
      state.groupPlanning[group.id] = { ...(state.groupPlanning[group.id] || {}), selectedWave: event.target.value,
        instructionalTier: String(group.tier || "").toLowerCase() };
      onChange(true);
    });
    coachSection.querySelector(".attendance-hybrid-note")?.addEventListener("input", event => {
      state.groupPlanning[group.id] = { ...(state.groupPlanning[group.id] || {}),
        currentNote: event.target.value, instructionalTier: String(group.tier || "").toLowerCase(),
        disposition: "replaced" };
      onChange();
    });
  }

  host.querySelectorAll("[data-hybrid-section]").forEach(section => section.addEventListener("toggle", () => {
    expanded[section.dataset.hybridSection] = section.open;
  }));
  host.querySelectorAll("[data-hybrid-source]").forEach(input => {
    input.addEventListener("click", event => event.stopPropagation());
    input.addEventListener("change", () => {
      state.planningSources = Object.fromEntries([...host.querySelectorAll("[data-hybrid-source]")].map(el => [el.dataset.hybridSource, el.checked]));
      onChange(true);
    });
  });
}
