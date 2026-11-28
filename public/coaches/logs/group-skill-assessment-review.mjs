import { prepareGroupSkillAssessment, SKILL_STAGES } from "./group-skill-assessment-policy.mjs";

// Read-first review UI. No backend write and no retained automatic assessment.
const safe = value => String(value ?? "").replace(/[&<>"']/g, char => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
})[char]);
const id = value => String(value ?? "").trim();
const display = athlete => athlete?.name || athlete?.fullName || athlete?.publicName || athlete?.id;

export function mountGroupSkillReview({ root, practice, attendance, roster, workedCards }) {
  if (!root) return;
  root.replaceChildren();
  const present = new Set(Array.isArray(attendance?.presentIds) ? attendance.presentIds.map(id) : []);
  const members = new Map((Array.isArray(roster) ? roster : [])
    .filter(athlete => present.has(id(athlete.id)))
    .map(athlete => [id(athlete.id), athlete]));
  const groups = (Array.isArray(practice?.trainingGroups) ? practice.trainingGroups : [])
    .map((group, index) => ({
      key: id(group.id || group.groupId || `group-${index + 1}`),
      label: id(group.name || group.label || `Group ${index + 1}`),
      ids: [...new Set((Array.isArray(group.athleteIds) ? group.athleteIds : [])
        .map(id).filter(athleteId => members.has(athleteId)))]
    })).filter(group => group.ids.length);
  // No invented room-wide membership: a non-grouped practice requires explicit
  // individual assessment in the existing Skill Check.
  const cards = (Array.isArray(workedCards) ? workedCards : []).filter(card =>
    id(card.skill) && !id(card.skill).includes("/") && id(card.skill).length <= 100);
  const skills = [...new Map(cards.map(card => [id(card.skill), {
    familyId: id(card.skill), label: id(card.title || card.skill)
  }])).values()];
  if (!practice || !present.size || !groups.length || !skills.length) {
    root.innerHTML = '<p class="muted">Group review unavailable: this practice needs verified participants, explicit training groups, and canonical worked skill IDs. Use individual Skill Check. Nothing is assessed automatically.</p>';
    return;
  }
  root.innerHTML = `
    <p class="muted">Development preview only. A Coach review does not verify skill evidence, award XP, or change a prior assessment.</p>
    <label for="groupSkillGroup">Practice group</label>
    <select id="groupSkillGroup"></select>
    <label for="groupSkillFamily">Worked skill (canonical ID required)</label>
    <select id="groupSkillFamily"></select>
    <label for="groupSkillDefault">Proposed group stage</label>
    <select id="groupSkillDefault"></select>
    <p class="muted">Adjust each athlete or choose Not assessed. No changes are saved.</p>
    <div id="groupSkillAthletes"></div>
    <button type="button" id="groupSkillReviewBtn">Review draft assessments</button>
    <div id="groupSkillReviewResult" role="status" aria-live="polite"></div>`;
  const groupEl = root.querySelector("#groupSkillGroup");
  const familyEl = root.querySelector("#groupSkillFamily");
  const stageEl = root.querySelector("#groupSkillDefault");
  const athleteEl = root.querySelector("#groupSkillAthletes");
  const resultEl = root.querySelector("#groupSkillReviewResult");
  groupEl.innerHTML = groups.map((g, i) => `<option value="${i}">${safe(g.label)} (${g.ids.length} present)</option>`).join("");
  familyEl.innerHTML = skills.map((s, i) => `<option value="${i}">${safe(s.label)} — ${safe(s.familyId)}</option>`).join("");
  stageEl.innerHTML = SKILL_STAGES.map(stage => `<option value="${stage}" ${stage === "LEARNED" ? "selected" : ""}>${safe(stage.replaceAll("_", " "))}</option>`).join("");

  function renderMembers() {
    const group = groups[Number(groupEl.value)];
    athleteEl.innerHTML = group.ids.map((athleteId, index) => `
      <div class="athlete-input">
        <label for="groupSkillMember${index}">${safe(display(members.get(athleteId)) || athleteId)}</label>
        <select id="groupSkillMember${index}" data-proposed-athlete="${safe(athleteId)}">
          <option value="DEFAULT">Use group proposal</option>
          ${SKILL_STAGES.map(stage => `<option value="${stage}">${safe(stage.replaceAll("_", " "))}</option>`).join("")}
          <option value="EXCLUDE">Not assessed</option>
        </select>
      </div>`).join("");
    resultEl.textContent = "";
  }
  groupEl.addEventListener("change", renderMembers);
  [familyEl, stageEl, athleteEl].forEach(el => el.addEventListener("change", () => { resultEl.textContent = ""; }));
  renderMembers();
  root.querySelector("#groupSkillReviewBtn").addEventListener("click", () => {
    const group = groups[Number(groupEl.value)];
    const family = skills[Number(familyEl.value)];
    const exceptions = {};
    const excludedIds = [];
    athleteEl.querySelectorAll("[data-proposed-athlete]").forEach(select => {
      const athleteId = select.dataset.proposedAthlete;
      if (select.value === "EXCLUDE") excludedIds.push(athleteId);
      else if (select.value !== "DEFAULT") exceptions[athleteId] = select.value;
    });
    const draft = prepareGroupSkillAssessment({
      athleteIds: group.ids, checkedInIds: [...present], familyId: family.familyId,
      defaultStage: stageEl.value, exceptions, excludedIds
    });
    if (!draft.ok) {
      resultEl.textContent = `Draft blocked: ${draft.blockers.join(" ")}`;
      return;
    }
    // Handoff is intentionally one athlete at a time: the existing Skill Check
    // callable authorizes each verified write. Draft stages are never passed as
    // save instructions and cannot silently change an athlete's prior record.
    const attendanceFinalized = attendance?.finalized === true
      && String(attendance?.status || "").toLowerCase() === "finalized"
      && String(attendance?.practiceId || "") === String(practice?.id || practice?.practiceId || "");
    const discipline = String(practice?.discipline || "").toLowerCase();
    const practiceId = String(practice?.id || practice?.practiceId || "");
    const canHandoff = attendanceFinalized
      && /^[A-Za-z0-9_-]{1,160}$/.test(practiceId)
      && ["wrestling", "boxing", "muay-thai"].includes(discipline);
    const items = draft.observations.map(observation => {
      const label = safe(display(members.get(observation.athleteId)) || observation.athleteId);
      const proposed = safe(observation.proposedStage.replaceAll("_", " "));
      const link = canHandoff
        ? ` <a href="/coaches/skill-check/?id=${encodeURIComponent(observation.athleteId)}&amp;practiceId=${encodeURIComponent(practiceId)}&amp;discipline=${encodeURIComponent(discipline)}">Open individual Skill Check</a>`
        : "";
      return `<li>${label}: ${proposed}${observation.individuallyAdjusted ? " (individual adjustment)" : ""}${link}</li>`;
    }).join("");
    resultEl.innerHTML = `<p><strong>Draft review: ${draft.observations.length} proposed; ${draft.excludedAthleteIds.length} not assessed.</strong></p>
      <ul>${items}</ul><p class="muted">${canHandoff
        ? "Open each athlete's existing Skill Check, select the reviewed stage, and explicitly save. The group draft itself has not been saved."
        : "Individual verification is locked until canonical attendance is finalized. Reload the practice after finalization. The group draft itself has not been saved."}
      No XP, promotion or AUTO progression is issued by this review.</p>`;
  });
}
