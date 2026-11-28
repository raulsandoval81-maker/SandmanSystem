import { prepareGroupSkillAssessment, SKILL_STAGES } from "./group-skill-assessment-policy.mjs";

// A reviewed assessment is submitted only by a separate explicit confirmation.
const safe = value => String(value ?? "").replace(/[&<>"']/g, char => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
})[char]);
const id = value => String(value ?? "").trim();
const display = athlete => athlete?.name || athlete?.fullName || athlete?.publicName || athlete?.id;

export function mountGroupSkillReview({ root, practice, practiceId: canonicalPracticeId, attendance, roster, confirm }) {
  if (!root) return;
  root.replaceChildren();
  const present = new Set(Array.isArray(attendance?.presentIds) ? attendance.presentIds : []);
  const members = new Map((Array.isArray(roster) ? roster : [])
    .filter(athlete => present.has(athlete.id))
    .map(athlete => [athlete.id, athlete]));
  const memory = practice?.sessionMemory;
  const discipline = String(practice?.discipline || "");
  const planned = Array.isArray(memory?.plannedCards) ? memory.plannedCards : [];
  const worked = Array.isArray(memory?.workedCards) ? memory.workedCards : [];
  const groupMap = new Map();
  for (const card of worked) {
    const familyId = id(card.familyId || card.skillId).toLowerCase();
    const groupId = id(card.groupId);
    if (!/^[A-Za-z0-9_-]{1,120}$/.test(groupId) || !/^[a-z0-9_]{1,100}$/.test(familyId)
      || (card.discipline && card.discipline !== discipline)) continue;
    const plan = planned.find(item => item.groupId === groupId && item.cardId === card.cardId
      && item.blockId === card.blockId && id(item.familyId || item.skillId).toLowerCase() === familyId
      && (!item.discipline || item.discipline === discipline));
    const ids = (Array.isArray(card.athleteIds) ? card.athleteIds : [])
      .filter(athleteId => members.has(athleteId) && plan?.athleteIds?.includes(athleteId));
    if (!ids.length) continue;
    const group = groupMap.get(groupId) ?? { key: groupId,
      label: groupId, skills: new Map() };
    const skill = group.skills.get(familyId) ?? { familyId, label: card.title || familyId, ids: new Set() };
    ids.forEach(athleteId => skill.ids.add(athleteId));
    group.skills.set(familyId, skill);
    groupMap.set(groupId, group);
  }
  const groups = [...groupMap.values()];
  if (!groups.length || attendance?.finalized !== true || attendance.status !== "finalized"
    || attendance.practiceId !== canonicalPracticeId) {
    root.innerHTML = '<p class="muted">Group confirmation requires finalized attendance and a recorded group skill. Use individual Skill Check when a group record is unavailable.</p>';
    return;
  }
  root.innerHTML = `
    <p class="muted">Review each outcome before confirming. Confirmation saves individual skill evidence and awards no XP.</p>
    <label for="groupSkillGroup">Practice group</label>
    <select id="groupSkillGroup"></select>
    <label for="groupSkillFamily">Worked skill (canonical ID required)</label>
    <select id="groupSkillFamily"></select>
    <label for="groupSkillDefault">Proposed group stage</label>
    <select id="groupSkillDefault"></select>
    <p class="muted">Adjust each athlete or choose Not assessed.</p>
    <div id="groupSkillAthletes"></div>
    <button type="button" id="groupSkillReviewBtn">Review assessments</button>
    <button type="button" id="groupSkillConfirmBtn" hidden>Confirm assessments</button>
    <div id="groupSkillReviewResult" role="status" aria-live="polite"></div>`;
  const groupEl = root.querySelector("#groupSkillGroup");
  const familyEl = root.querySelector("#groupSkillFamily");
  const stageEl = root.querySelector("#groupSkillDefault");
  const athleteEl = root.querySelector("#groupSkillAthletes");
  const resultEl = root.querySelector("#groupSkillReviewResult");
  const reviewBtn = root.querySelector("#groupSkillReviewBtn");
  const confirmBtn = root.querySelector("#groupSkillConfirmBtn");
  let reviewed;
  const selectedGroup = () => groups[Number(groupEl.value)];
  const selectedSkill = () => [...selectedGroup().skills.values()][Number(familyEl.value)];
  const clearReview = () => {
    reviewed = undefined;
    confirmBtn.hidden = true;
    resultEl.textContent = "";
  };
  groupEl.innerHTML = groups.map((group, index) => `<option value="${index}">${safe(group.label)}</option>`).join("");
  stageEl.innerHTML = SKILL_STAGES.map(stage => `<option value="${stage}" ${stage === "LEARNED" ? "selected" : ""}>${safe(stage.replaceAll("_", " "))}</option>`).join("");

  function renderMembers() {
    athleteEl.innerHTML = [...selectedSkill().ids].map((athleteId, index) => `
      <div class="athlete-input">
        <label for="groupSkillMember${index}">${safe(display(members.get(athleteId)) || athleteId)}</label>
        <select id="groupSkillMember${index}" data-proposed-athlete="${safe(athleteId)}">
          <option value="DEFAULT">Use group proposal</option>
          ${SKILL_STAGES.map(stage => `<option value="${stage}">${safe(stage.replaceAll("_", " "))}</option>`).join("")}
          <option value="EXCLUDE">Not assessed</option>
        </select>
      </div>`).join("");
    clearReview();
  }
  function renderSkills() {
    familyEl.innerHTML = [...selectedGroup().skills.values()].map((skill, index) =>
      `<option value="${index}">${safe(skill.label)} — ${safe(skill.familyId)}</option>`).join("");
    renderMembers();
  }
  groupEl.addEventListener("change", renderSkills);
  familyEl.addEventListener("change", renderMembers);
  [stageEl, athleteEl].forEach(element => element.addEventListener("change", clearReview));
  renderSkills();

  reviewBtn.addEventListener("click", () => {
    clearReview();
    const exceptions = Object.create(null);
    const excludedIds = [];
    athleteEl.querySelectorAll("[data-proposed-athlete]").forEach(select => {
      const athleteId = select.dataset.proposedAthlete;
      if (select.value === "EXCLUDE") excludedIds.push(athleteId);
      else if (select.value !== "DEFAULT") exceptions[athleteId] = select.value;
    });
    const skill = selectedSkill();
    const draft = prepareGroupSkillAssessment({
      athleteIds: [...skill.ids], checkedInIds: [...present], familyId: skill.familyId,
      defaultStage: stageEl.value, exceptions, excludedIds
    });
    if (!draft.ok || !draft.observations.length) {
      resultEl.textContent = draft.blockers.join(" ") || "Select at least one assessed athlete.";
      return;
    }
    reviewed = {
      practiceId: canonicalPracticeId, groupId: selectedGroup().key, discipline, familyId: skill.familyId,
      observations: draft.observations.map(row => ({ athleteId: row.athleteId, state: row.proposedStage })),
    };
    const list = draft.observations.map(row => {
      const params = new URLSearchParams({ id: row.athleteId, practiceId: canonicalPracticeId, discipline });
      const link = `/coaches/skill-check/?${safe(params.toString())}`;
      return `<li>${safe(display(members.get(row.athleteId)))}: ${safe(row.proposedStage.replaceAll("_", " "))}
        <a href="${link}">Open individual Skill Check</a></li>`;
    });
    for (const athleteId of draft.excludedAthleteIds) {
      list.push(`<li>${safe(display(members.get(athleteId)))}: Not assessed</li>`);
    }
    resultEl.innerHTML = `<p><strong>Review individual outcomes</strong></p><ul>${list.join("")}</ul>`;
    confirmBtn.hidden = false;
  });
  confirmBtn.addEventListener("click", async () => {
    if (!reviewed || confirmBtn.disabled) return;
    root.querySelectorAll("button, select").forEach(element => { element.disabled = true; });
    try {
      const result = await confirm(reviewed);
      resultEl.textContent = `Confirmed ${result.count} individual assessments. No XP awarded.`;
    } catch (error) {
      resultEl.textContent = error?.code === "functions/already-exists"
        ? "An assessment already exists. Existing evidence was preserved."
        : "Confirmation could not be verified. Reload and review the practice before continuing.";
    } finally {
      reviewed = undefined;
      confirmBtn.hidden = true;
      root.querySelectorAll("button, select").forEach(element => { element.disabled = false; });
    }
  });
}
