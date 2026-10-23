const PAYLOAD_KEY = "sandman_last_practice_payload";
const LOG_KEY = "sandman_last_practice_log";

import { functions, httpsCallable } from "/assets/js/firebase-init.js";
import { coachLoginUrl, isCoachAuthenticationError, requireCoach } from "/assets/js/coach-guard.js?v=2";
import { programById, programsForLocation } from "/coaches/execution/session-builder/session-entry-policy.js";

let payload = JSON.parse(
  localStorage.getItem(PAYLOAD_KEY) || "null"
);

/* =========================
   IMPORTANT:
   Coach Companion nests the
   original clipboard session
   inside coachSession.
========================= */

let sessionSource =
  payload?.coachSession || payload || {};

const params = new URLSearchParams(window.location.search);
const requestedPracticeId = String(
  params.get("practiceId") || params.get("practice") || sessionSource.practiceId || payload?.practiceId || ""
).trim();
let canonicalPractice = null;
let canonicalAttendance = null;
let canonicalRoster = [];
let canonicalAthleteInputs = {};
 
const summary = document.getElementById("sessionSummary");
const statusEl = document.getElementById("status");
const athleteInputEl = document.getElementById("athleteInput");
const dailyGrindLink = document.getElementById("dailyGrindLink");
const practiceDiscipline = document.getElementById("practiceDiscipline");
const practiceProgram = document.getElementById("practiceProgram");
const practiceTier = document.getElementById("practiceTier");
const practiceWeek = document.getElementById("practiceWeek");
const practiceDuration = document.getElementById("practiceDuration");
const practiceDetailsStatus = document.getElementById("practiceDetailsStatus");

const saveBtn = document.getElementById("saveBtn");
const dailyGrindStep = document.getElementById("dailyGrindStep");
let saveInProgress = false;
let inputRevision = 0;

function showSaveCheckpoint(saved) {
  if (dailyGrindStep) dailyGrindStep.hidden = !saved;
  if (saveBtn) saveBtn.hidden = saved;
}

function markPracticeInputChanged() {
  inputRevision += 1;
  showSaveCheckpoint(false);
  if (statusEl) statusEl.textContent = "Unsaved changes — save the practice log before continuing to XP.";
}

// The next step is earned only by a successful durable save of this practice.
document.addEventListener("input", (event) => {
  if (event.target.closest("#athleteInput, #worked, #needs, #standout, #coachNote, #tierWeek")) {
    markPracticeInputChanged();
  }
});
document.addEventListener("change", (event) => {
  if (event.target.closest("#fear, #athleteInput, #practiceDetailsCard")) {
    markPracticeInputChanged();
  }
});


function displayJourney(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (["z2h", "zero2hero", "zero-to-hero", "zero2hero™", "r2c", "road2champion"].includes(normalized)) return "Road2Champion";
  if (["p2l", "path2legend"].includes(normalized)) return "Path2Legend";
  return String(value || "—");
}

function isManualIdentityEntry(practice) {
  if (!practice) return false;
  const mode = String(practice.entryMode || practice.schema || "").toLowerCase();
  return ["fast-practice", "manual-build", "manual-entry"].includes(mode) ||
    String(practice.program || "").toLowerCase() === "manual-build";
}

function updateIdentityVisibility() {
  const identityCard = document.getElementById("practiceDetailsCard");
  if (identityCard) identityCard.hidden = !isManualIdentityEntry(canonicalPractice);
  const tierWeekField = document.getElementById("tierWeekField");
  if (tierWeekField) tierWeekField.hidden = !isManualIdentityEntry(canonicalPractice);
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function getWeekKey(date = new Date()) {
  const d = new Date(
    Date.UTC(
      date.getFullYear(),
      date.getMonth(),
      date.getDate()
    )
  );

  const dayNum = d.getUTCDay() || 7;

  d.setUTCDate(d.getUTCDate() + 4 - dayNum);

  const yearStart = new Date(
    Date.UTC(d.getUTCFullYear(), 0, 1)
  );

  const weekNo = Math.ceil(
    (((d - yearStart) / 86400000) + 1) / 7
  );

  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}

function getBlocks() {
  if (canonicalPractice) {
    const memory = canonicalPractice.sessionMemory || {};
    return Array.isArray(memory.workedBlocks) ? memory.workedBlocks : [];
  }
  return Array.isArray(payload?.blocks)
    ? payload.blocks
    : [];
}

function getCardsFromBlocks(blocks) {

  return blocks.flatMap(block => {

    const cards = Array.isArray(block.cards)
      ? block.cards
      : [];

    return cards.map(card => {

      if (typeof card === "string") {

        return {
          title: card,
          href: "",

          slot: block.slot || "",

          block:
            block.label ||
            block.title ||
            block.slot ||
            ""
        };
      }

      return {
        title: card.title || "",
        href: card.href || "",

        skill: card.skill || card.skillId || "",
        groupId: String(card.groupId || ""),
        athleteIds: Array.isArray(card.athleteIds) ? card.athleteIds.map(String) : [],

        discipline:
          card.discipline ||
          sessionSource.discipline ||
          "",

        journey:
          card.journey ||
          sessionSource.journey ||
          "",

        tier:
          card.tier ||
          sessionSource.tier ||
          "",

        slot: block.slot || "",

        block:
          block.label ||
          block.title ||
          block.slot ||
          ""
      };

    });

  }).filter(card => card.title);
}

function getSkillsFromCards(cards) {

  const seen = new Set();

  return cards
    .filter(card => card.skill || card.title)

    .map(card => ({
      skill: card.skill || "",
      title: card.title || "",

      discipline: card.discipline || "",
      journey: card.journey || "",
      tier: card.tier || ""
    }))

    .filter(item => {

      const key =
        `${item.skill}|${item.title}|${item.discipline}|${item.journey}|${item.tier}`;

      if (seen.has(key)) return false;

      seen.add(key);

      return true;
    });
}

function getStructure(blocks) {

  const totalMinutes =
    blocks.reduce(
      (sum, b) => sum + Number(b.minutes || 0),
      0
    );

  const liveMinutes =
    blocks
      .filter(
        b => (b.slot || "").toLowerCase() === "live"
      )
      .reduce(
        (sum, b) => sum + Number(b.minutes || 0),
        0
      );

  const conditioningMinutes =
    blocks
      .filter(b =>
        ["cond", "conditioning"]
          .includes((b.slot || "").toLowerCase())
      )
      .reduce(
        (sum, b) => sum + Number(b.minutes || 0),
        0
      );

  return {
    totalMinutes,
    liveMinutes,
    conditioningMinutes,

    blocks: blocks.map(b => ({
      slot: b.slot || "",

      label:
        b.label ||
        b.title ||
        b.slot ||
        "",

      minutes: Number(b.minutes || 0),

      notes: b.notes || ""
    }))
  };
}

function updateCloseoutLinks() {
  const practiceId = String(
    requestedPracticeId ||
    sessionSource.practiceId ||
    payload?.practiceId ||
    ""
  ).trim();

  if (dailyGrindLink) {
    dailyGrindLink.href = practiceId
      ? `/coaches/attendance/?session=${encodeURIComponent(practiceId)}`
      : "/coaches/daily-xp/";
  }
}

function renderSummary() {

  updateCloseoutLinks();

  if (!summary) return;

  if (!payload && !canonicalPractice) {

    summary.innerHTML = `
      <p class="muted">
        No session payload found.
      </p>
    `;

    return;
  }

  const blocks = getBlocks();

  const cards =
    getCardsFromBlocks(blocks);

  const structure =
    getStructure(blocks);
  const plannedBlocks = Array.isArray(canonicalPractice?.sessionMemory?.plannedBlocks)
    ? canonicalPractice.sessionMemory.plannedBlocks : [];
  const plannedMinutes = plannedBlocks.reduce((sum, block) => sum + Number(block.minutes || 0), 0);
  const groups = Array.isArray(canonicalPractice?.trainingGroups)
    ? canonicalPractice.trainingGroups
    : Array.isArray(sessionSource.trainingGroups) ? sessionSource.trainingGroups : [];
  const checkedIn = Array.isArray(canonicalAttendance?.checkedInIds)
    ? canonicalAttendance.checkedInIds.length : null;
  const verified = Array.isArray(canonicalAttendance?.presentIds)
    ? canonicalAttendance.presentIds.length : null;

  summary.innerHTML = `

    <p>
      <strong>Source:</strong>
      ${escapeHtml(canonicalPractice ? "canonical practice" : payload.source || "unknown")}
    </p>

    <p>
      <strong>Schema:</strong>
      ${escapeHtml(sessionSource.schema || canonicalPractice?.entryMode || "—")}
    </p>

    <p>
  <strong>Track:</strong>
  ${escapeHtml(sessionSource.track || "—")}
</p>

    <p>
      <strong>Discipline:</strong>
      ${escapeHtml(sessionSource.discipline || "—")}
    </p>

    <p>
      <strong>Journey:</strong>
      ${escapeHtml(displayJourney(sessionSource.journey))}
    </p>

    <p>
      <strong>Practice focus tier:</strong>
      ${escapeHtml(sessionSource.tier || "Not specified (group tiers remain separate)")}
    </p>
    <p><strong>Training week:</strong> ${escapeHtml(canonicalPractice?.week || sessionSource.week || "Not recorded")}</p>
    <p><strong>Training stage:</strong> ${escapeHtml(canonicalPractice?.stage || "Not recorded; no inferred stage")}</p>


    <p>
      <strong>Worked block allocation:</strong>
      ${structure.totalMinutes} min
      ·
      <strong>Live:</strong>
      ${structure.liveMinutes} min
      ·
      <strong>Conditioning:</strong>
      ${structure.conditioningMinutes} min
    </p>

    ${canonicalPractice ? `
      ${canonicalPractice.sessionMemory?.syntheticExecution?.synthetic === true
        ? '<p class="warning"><strong>STAGING SYNTHETIC TEST:</strong> 0 real training minutes and no worked cards. This marker is authoritative and must remain attached to this test record.</p>'
        : ""}
      <p><strong>Planned duration:</strong> ${plannedMinutes || canonicalPractice.durationMinutes || "Not recorded"} min · <strong>Actual elapsed:</strong> Unverified</p>
      <p><strong>Training groups:</strong> ${groups.length ? groups.length : "Not available in practice record"} · <strong>Checked in:</strong> ${checkedIn ?? "Not available"} · <strong>Verified present:</strong> ${verified ?? "Not available"}</p>
      ${plannedMinutes > structure.totalMinutes ? '<p class="muted">The worked-block record is incomplete relative to the plan; do not interpret worked minutes as actual elapsed time.</p>' : ""}
      <p><strong>Practice:</strong> ${escapeHtml(requestedPracticeId)}</p>
      <p><strong>Date:</strong> ${escapeHtml(canonicalAttendance?.sessionDateKey || canonicalPractice.sessionDateKey || "—")}</p>
      <p><strong>Status:</strong> ${escapeHtml(canonicalPractice.status || "—")} · <strong>Verified:</strong> ${Array.isArray(canonicalAttendance?.presentIds) ? canonicalAttendance.presentIds.length : 0}</p>
    ` : ""}

    ${payload?.observations ? `
      <h3>Daily Practice Log Observations</h3>
      <p><strong>Team:</strong> ${escapeHtml(payload.observations.teamNotes || "—")}</p>
      <p><strong>Events:</strong> ${escapeHtml(payload.observations.eventNotes || "—")}</p>
      <p><strong>General:</strong> ${escapeHtml(payload.observations.generalNotes || "—")}</p>
      <h4>Individual Athletes</h4>
      <ul>${Object.entries(payload.observations.individualNotes || {})
        .filter(([,note]) => String(note).trim())
        .map(([id,note]) => `<li><strong>${escapeHtml(id)}</strong>: ${escapeHtml(note)}</li>`).join("") || "<li>No individual notes</li>"}</ul>
    ` : ""}

    <h3>Blocks</h3>

    <ul>
      ${structure.blocks.map(b => `
        <li>

          <strong>
            ${escapeHtml(b.label)}
          </strong>

          — ${b.minutes} min

          ${
            b.notes
              ? `<br><span class="muted">${escapeHtml(b.notes)}</span>`
              : ""
          }

        </li>
      `).join("")}
    </ul>

    <h3>Cards / Skills Used</h3>

    ${
      cards.length

        ? `<ul>

            ${cards.map(card => `

              <li>

                ${
                  card.href

                    ? `
                      <a
                        href="${escapeHtml(card.href)}"
                        target="_blank"
                        rel="noopener"
                      >
                        ${escapeHtml(card.title)}
                      </a>
                    `

                    : escapeHtml(card.title)
                }

                ${
                  card.tier
                    ? `<span class="muted"> · ${escapeHtml(card.tier)}</span>`
                    : ""
                }

              </li>

            `).join("")}

          </ul>`

        : `
          <p class="muted">
            No session concepts captured.
          </p>
        `
    }
  `;
}

function getValue(id) {
  return document.getElementById(id)?.value.trim() || "";
}

function setValue(id, next) {
  const element = document.getElementById(id);
  if (element) element.value = String(next || "");
}

function renderAthleteInputs() {
  if (!athleteInputEl) return;

  const presentIds = Array.isArray(canonicalAttendance?.presentIds)
    ? canonicalAttendance.presentIds.map(String)
    : [];

  const roster = new Map(
    canonicalRoster.map((athlete) => [String(athlete.id), athlete])
  );

  const skillsWorked = getSkillsFromCards(
    getCardsFromBlocks(getBlocks())
  );

  // Do not present room-wide skills as athlete-specific instruction.
  const workedCards = getCardsFromBlocks(getBlocks());
  const groups = Array.isArray(canonicalPractice?.trainingGroups)
    ? canonicalPractice.trainingGroups
    : Array.isArray(sessionSource.trainingGroups) ? sessionSource.trainingGroups : [];
  const athleteGroups = new Map();
  groups.forEach((group) => {
    const ids = Array.isArray(group.athleteIds) ? group.athleteIds : [];
    ids.forEach((id) => {
      const key = String(id);
      if (!athleteGroups.has(key)) athleteGroups.set(key, new Set());
      athleteGroups.get(key).add(String(group.id || group.groupId || ""));
    });
  });
  function labelsForAthlete(athleteId) {
    const groupIds = athleteGroups.get(athleteId) || new Set();
    return [...new Set(workedCards.filter((card) =>
      (Array.isArray(card.athleteIds) && card.athleteIds.includes(athleteId)) ||
      (card.groupId && groupIds.has(card.groupId))
    ).map((card) => card.title || card.skill).filter(Boolean))];
  }

  if (!presentIds.length) {
    athleteInputEl.innerHTML =
      `<p class="muted">No verified participants for this practice.</p>`;
    return;
  }

  athleteInputEl.innerHTML = presentIds.map((athleteId) => {
    const athlete = roster.get(athleteId) || {};
    const input = canonicalAthleteInputs[athleteId] || {};

    const athleteSkills = labelsForAthlete(athleteId);
    const skillsHtml = athleteSkills.length
      ? athleteSkills.map((label) => `<li>${escapeHtml(label)}</li>`).join("")
      : `<li class="muted">No athlete-specific worked skills verified; review group execution.</li>`;

    return `
      <article
        class="athlete-input"
        data-athlete-id="${escapeHtml(athleteId)}"
      >
        <h3>
          ${escapeHtml(
            athlete.name ||
            athlete.fullName ||
            athlete.publicName ||
            athleteId
          )}
        </h3>

        <div class="athlete-skills-worked">
          <strong>Worked Skills Linked to Athlete / Group (instruction only)</strong>
          <ul>
            ${skillsHtml}
          </ul>
        </div>

        <label>Coach Observation</label>
        <textarea
          data-field="coachObservation"
          placeholder="Individual practice observation"
        >${escapeHtml(input.coachObservation || "")}</textarea>

        <label>Development Note</label>
        <textarea
          data-field="developmentNote"
          placeholder="Optional next development focus"
        >${escapeHtml(input.developmentNote || "")}</textarea>
      </article>
    `;
  }).join("");
}

function populatePracticePrograms() {
  if (!practiceProgram || !canonicalPractice) return;
  const locationId = String(canonicalPractice.locationId || canonicalPractice.academyId || "").trim();
  const programs = programsForLocation(locationId).filter((program) => program.programId !== "manual-build" && ["wrestling", "boxing", "muay-thai"].includes(String(program.discipline || "").toLowerCase()));
  practiceProgram.innerHTML = '<option value="">No program selected</option>';
  programs.forEach((program) => {
    const option = document.createElement("option");
    option.value = program.programId;
    option.textContent = program.label;
    practiceProgram.appendChild(option);
  });
  if (canonicalPractice.program && programs.some((program) => program.programId === canonicalPractice.program)) {
    practiceProgram.value = canonicalPractice.program;
  }
  if (practiceDiscipline && canonicalPractice.discipline !== "unassigned") {
    practiceDiscipline.value = canonicalPractice.discipline || "";
  }
  if (practiceTier) practiceTier.value = canonicalPractice.tier || "";
  if (practiceWeek) practiceWeek.value = canonicalPractice.week || "";
  if (practiceDuration) practiceDuration.value = canonicalPractice.durationMinutes || "";
}

async function savePracticeDetails() {
  if (!canonicalPractice || !requestedPracticeId) throw new Error("Canonical practice is required.");
  if (!isManualIdentityEntry(canonicalPractice)) throw new Error("System-routed practice identity is inherited and cannot be edited here.");
  const selected = programById(practiceProgram?.value || "");
  const discipline = String(selected?.discipline || practiceDiscipline?.value || "").trim();
  if (!["wrestling", "boxing", "muay-thai"].includes(discipline)) throw new Error("Combat Post-Practice requires Wrestling, Boxing, or Muay Thai.");
  const durationMinutes = Math.max(1, Math.min(480, Number(practiceDuration?.value || canonicalPractice.durationMinutes || 60)));
  const week = String(practiceWeek?.value || "").trim();
  const tier = String(practiceTier?.value || "").trim();

  const openPractice = httpsCallable(functions, "openPracticeSession");
  await openPractice({
    practiceId: requestedPracticeId,
    liveSessionId: canonicalPractice.liveSessionId,
    locationId: canonicalPractice.locationId || canonicalPractice.academyId,
    academyId: canonicalPractice.locationId || canonicalPractice.academyId,
    roomId: canonicalPractice.roomId,
    discipline,
    journey: selected?.journey || canonicalPractice.journey || "",
    program: selected?.programId || canonicalPractice.program || "",
    track: selected?.track || selected?.foundry || canonicalPractice.track || "",
    tier,
    schema: canonicalPractice.schema || "fast-practice",
    executionMode: canonicalPractice.executionMode || "manual",
    durationMinutes,
    week
  });

  canonicalPractice = {
    ...canonicalPractice,
    discipline,
    journey: selected?.journey || canonicalPractice.journey || "",
    program: selected?.programId || canonicalPractice.program || "",
    track: selected?.track || selected?.foundry || canonicalPractice.track || "",
    tier,
    week,
    durationMinutes
  };
  sessionSource = {
    ...sessionSource,
    discipline: canonicalPractice.discipline,
    journey: canonicalPractice.journey,
    track: canonicalPractice.track || "",
    tier: canonicalPractice.tier
  };
  renderSummary();
  if (practiceDetailsStatus) practiceDetailsStatus.textContent = "Practice details saved.";
}

async function loadCanonicalPractice() {
  if (!requestedPracticeId || requestedPracticeId.includes("/")) return;
  const getReview = httpsCallable(functions, "getPracticeAttendanceReview");
  const response = await getReview({ practiceId: requestedPracticeId });
  canonicalPractice = response.data?.practice || null;
  canonicalAttendance = response.data?.attendance || null;
  canonicalRoster = Array.isArray(response.data?.roster) ? response.data.roster : [];
  canonicalAthleteInputs = response.data?.athleteInputs || {};
  if (!canonicalPractice) throw new Error("Canonical practice not found.");
  populatePracticePrograms();
  updateIdentityVisibility();
  payload = payload || { source: "canonical-practice", blocks: [] };
  sessionSource = {
    ...sessionSource,
    practiceId: requestedPracticeId,
    discipline: canonicalPractice.discipline || "",
    journey: canonicalPractice.journey || "",
    track: canonicalPractice.track || "",
    tier: canonicalPractice.tier || "",
    week: canonicalPractice.week || "",
    trainingGroups: canonicalPractice.trainingGroups || sessionSource.trainingGroups || [],
    schema: canonicalPractice.entryMode || "normal",
  };
  const sharedLog = canonicalPractice.dailyPracticeLog || null;
  if (sharedLog) {
    const observations = {
      teamNotes: sharedLog.teamNotes || "",
      eventNotes: sharedLog.eventNotes || "",
      generalNotes: sharedLog.generalNotes || "",
      individualNotes: sharedLog.individualNotes || {}
    };
    const existing = payload?.practiceId === requestedPracticeId ? payload : {};
    payload = {
      ...existing,
      source: "daily-practice-log",
      practiceId: requestedPracticeId,
      focus: sharedLog.focus || existing.focus || "",
      observations,
      blocks: (Array.isArray(existing.blocks) ? existing.blocks : []).map(block => ({
        ...block, notes: sharedLog.blockNotes?.[block.slot] ?? block.notes ?? ""
      }))
    };
    renderSummary();
  }
  const reflection = canonicalPractice.sessionMemory?.reflection || {};
  setValue("fear", reflection.fearRating);
  setValue("worked", reflection.worked);
  setValue("needs", reflection.needsWork);
  setValue("standout", reflection.standout);
  setValue("coachNote", reflection.coachNote);
  renderAthleteInputs();
}

async function saveLog() {
  if (saveInProgress) return;
  // A legacy practice without an ID may still be archived locally, but never unlock XP.
  // A known canonical ID that fails to load must not silently fall back to local-only.
  if (!canonicalPractice && requestedPracticeId) {
    if (statusEl) statusEl.textContent = "Canonical practice not loaded — cannot continue to XP.";
    return;
  }
  saveInProgress = true;
  const savingRevision = inputRevision;
  if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = "Saving practice log…"; }
  if (statusEl) statusEl.textContent = "Saving practice and athlete notes…";
  try {
  const blocks = getBlocks();

  const cards =
    getCardsFromBlocks(blocks);

  const skills =
    getSkillsFromCards(cards);

  const structure =
    getStructure(blocks);

  const now = new Date();

  const log = {

    logType: "practice",

    session: {

      date:
        now.toISOString().slice(0, 10),

      source:
        payload?.source || "unknown",

      schema:
        sessionSource.schema || "",

         track:
    sessionSource.track || "",

      discipline:
        sessionSource.discipline || "",

      journey:
        sessionSource.journey || "",

      tier:
        sessionSource.tier || "",

      tierWeek:
        getValue("tierWeek"),
    },

    structure,

    cards,

    skills,

    coachReflection: {

      fear: getValue("fear"),

      worked:
        getValue("worked"),

      needs:
        getValue("needs"),

      standout:
        getValue("standout"),

      coachNote:
        getValue("coachNote")
    },

    athleteFeedbackSeeds: {

      teamNeedsWork:
        getValue("needs")
          ? [getValue("needs")]
          : [],

      individualNeedsWork: []
    },

    tracking: {

      weekKey:
        getWeekKey(now),

      savedAt:
        now.toISOString()
    },

    rawPayload:
      payload || null
  };

  localStorage.setItem(
    LOG_KEY,
    JSON.stringify(log)
  );

  const practiceId = String(requestedPracticeId || sessionSource.practiceId || payload?.practiceId || "").trim();
  if (!practiceId) {
    showSaveCheckpoint(false);
    if (statusEl) statusEl.textContent = "Saved locally (legacy session). Daily Grind XP requires a canonical practice.";
    return;
  }
  if (practiceId) {
    try {
      const saveMemory = httpsCallable(functions, "savePracticeSessionMemory");
      await saveMemory({
        operation: "reflection",
        practiceId,
        reflection: {
          fearRating: log.coachReflection.fear,
          worked: log.coachReflection.worked,
          needsWork: log.coachReflection.needs,
          standout: log.coachReflection.standout,
          coachNote: log.coachReflection.coachNote
        }
      });
      if (canonicalPractice) {
        const saveAthleteInput = httpsCallable(functions, "savePracticeAthleteInput");
        const cards = [...document.querySelectorAll("[data-athlete-id]")];
        await Promise.all(cards.map((card) => saveAthleteInput({
          practiceId,
          athleteId: card.dataset.athleteId,
          coachObservation: card.querySelector('[data-field="coachObservation"]')?.value.trim() || "",
          developmentNote: card.querySelector('[data-field="developmentNote"]')?.value.trim() || "",
        })));
      }
    } catch (error) {
      console.error("Durable practice reflection save failed", error);
      showSaveCheckpoint(false);
      if (statusEl) statusEl.textContent = "Practice log not fully saved. " + (error?.message || "Please try again.");
      return;
    }
  }

  if (savingRevision !== inputRevision) {
    showSaveCheckpoint(false);
    if (statusEl) statusEl.textContent = "Notes changed while saving. Save again before continuing to XP.";
    return;
  }
  showSaveCheckpoint(true);
  if (statusEl) statusEl.textContent = "Practice Log saved successfully. Continue to Attendance & Daily Grind XP.";
  } catch (error) {
    showSaveCheckpoint(false);
    console.error("Practice Log save failed", error);
    if (statusEl) statusEl.textContent = error?.message || "Practice Log save failed. Try again.";
  } finally {
    saveInProgress = false;
    if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = "Save Practice Log"; }
  }
}

async function initializePracticeLog() {
  showSaveCheckpoint(false);
  try {
    await requireCoach();
    await loadCanonicalPractice();
    renderSummary();
    if (statusEl) statusEl.textContent = canonicalPractice ? "Canonical practice loaded." : "Legacy local practice loaded.";
  } catch (error) {
    console.error("Practice Log initialization failed", error);
    if (isCoachAuthenticationError(error)) {
      window.location.replace(coachLoginUrl());
      return;
    }
    if (statusEl) statusEl.textContent = error?.message || "Unable to load practice.";
  }
}

document
  .getElementById("saveBtn")
  ?.addEventListener("click", () => {
    saveLog().catch((error) => {
      console.error("Practice Log save failed", error);
      if (statusEl) statusEl.textContent = error?.message || "Unable to save practice input.";
    });
  });

practiceProgram?.addEventListener("change", () => {
  const selected = programById(practiceProgram.value);
  if (selected && practiceDiscipline) practiceDiscipline.value = selected.discipline;
});

document.getElementById("savePracticeDetailsBtn")?.addEventListener("click", () => {
  savePracticeDetails().catch((error) => {
    console.error("Practice details save failed", error);
    if (practiceDetailsStatus) practiceDetailsStatus.textContent = error?.message || "Unable to save practice details.";
  });
});

initializePracticeLog();
