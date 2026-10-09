import {
  functions,
  httpsCallable
} from "/assets/js/firebase-init.js";

import {
  coachLoginUrl,
  requireCoach
} from "/assets/js/coach-guard.js";

import {
  SESSION_ROOMS,
  programsForLocation,
  programById,
  roomByValue
} from "/coaches/execution/session-builder/session-entry-policy.js";

const $ = (id) => document.getElementById(id);

const createOrRecoverPractice =
  httpsCallable(functions, "createOrRecoverCanonicalPractice");

function todayKey() {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

function requestedMode() {
  const mode = String(
    new URLSearchParams(location.search).get("mode") || ""
  ).trim().toLowerCase();

  return ["planned", "quick-start", "after-the-fact"].includes(mode) ? mode : "after-the-fact";
}

function populateRooms(scopeLocationIds = [], isSystemAdmin = false) {
  const select = $("roomSelect");
  if (!select) return;

  select.replaceChildren();

  const allowed = new Set(
    (scopeLocationIds || []).map((id) => String(id || "").trim().toLowerCase())
  );

  SESSION_ROOMS
    .filter((room) =>
      isSystemAdmin ||
      !allowed.size ||
      allowed.has(String(room.locationId || "").toLowerCase())
    )
    .forEach((room) => {
      const option = document.createElement("option");
      option.value = room.value;
      option.textContent = room.label;
      select.appendChild(option);
    });
}

function populatePrograms() {
  const room = roomByValue($("roomSelect")?.value || "");
  const select = $("programSelect");
  if (!select) return;

  select.innerHTML = '<option value="">Select Program</option>';

  programsForLocation(room?.locationId || "")
    .filter((program) => program.programId !== "manual-build")
    .forEach((program) => {
      const option = document.createElement("option");
      option.value = program.programId;
      option.textContent = program.label;
      select.appendChild(option);
    });
}

function updateModeUI() {
  const mode = $("entryMode")?.value || "coach-directed";
  const keyField = $("practiceKeyField");
  const title = $("entryTitle");
  const description = $("entryDescription");

  if (keyField) keyField.hidden = mode !== "after-the-fact";
  if ($("sessionDateKey")) {
    $("sessionDateKey").disabled = mode !== "after-the-fact";
    if (mode !== "after-the-fact") $("sessionDateKey").value = todayKey();
  }
  const createButton = $("createPractice");
  if (createButton) createButton.textContent = mode === "planned" ? "Continue to Attendance" : mode === "quick-start" ? "Open Big Clock" : "Recover Past Practice";

  if (title) title.textContent = mode === "planned" ? "Attendance Setup" : mode === "quick-start" ? "Quick Clock Setup" : "Record Past Practice";

  if (description) description.textContent = mode === "planned" ? "Choose room and program, then check in athletes before building the workout." : mode === "quick-start" ? "Choose room and program, then open Big Clock without a Builder or attendance detour." : "Recover a real completed practice and verify actual participants.";
}

function setStatus(message, isError = false) {
  const status = $("entryStatus");
  if (!status) return;
  status.textContent = message;
  status.classList.toggle("is-error", isError);
}

async function submit() {
  const mode = $("entryMode")?.value || "coach-directed";
  const room = roomByValue($("roomSelect")?.value || "");
  const program = programById($("programSelect")?.value || "");
  const sessionDateKey = mode === "after-the-fact" ? ($("sessionDateKey")?.value || "") : todayKey();
  const practiceKey = $("practiceKey")?.value?.trim() || "";

  if (!room) {
    setStatus("Choose a room.", true);
    return;
  }

  if (!program) {
    setStatus("Choose a program.", true);
    return;
  }

  if (!sessionDateKey) {
    setStatus("Choose the practice date.", true);
    return;
  }

  if (mode === "after-the-fact" && !practiceKey) {
    setStatus("Practice Key is required for after-the-fact recovery.", true);
    return;
  }

  const button = $("createPractice");
  if (button) button.disabled = true;

  try {
    setStatus("Creating canonical practice…");

    if (mode === "planned" || mode === "quick-start") {
      const openPractice = httpsCallable(functions, "openPracticeSession");
      const response = await openPractice({
        liveSessionId: room.value,
        locationId: room.locationId,
        academyId: room.locationId,
        roomId: room.roomId,
        sessionDateKey,
        discipline: program.discipline,
        journey: program.journey || "",
        program: program.programId,
        track: program.track || "",
        schema: mode === "quick-start" ? "fast-practice" : "academy-60",
        executionMode: mode === "planned" ? "hybrid" : "manual",
        durationMinutes: 60
      });
      const practiceId = String(response.data?.practiceId || "").trim();
      if (!practiceId) throw new Error("Practice identity was not returned.");

      const session = {
        practiceId, sessionId: room.value, roomValue: room.value,
        locationId: room.locationId, academyId: room.locationId, roomId: room.roomId,
        ...program, schema: mode === "quick-start" ? "fast-practice" : "academy-60",
        executionMode: mode === "planned" ? "hybrid" : "manual", durationMinutes: 60,
        source: mode === "quick-start" ? "session-builder-fast-pass" : "attendance-first",
        createdAt: new Date().toISOString()
      };
      localStorage.setItem("sandman_session_builder_v1", JSON.stringify(session));

      if (mode === "quick-start") {
        localStorage.setItem("sandman_big_clock_payload_v2", JSON.stringify({
          source: "session-builder-fast-pass",
          practiceId, sessionId: room.value, durationMinutes: 60,
          blocks: [{ title: "Practice", minutes: 60, cards: [], notes: "", drillBlocks: [] }]
        }));
        location.href = "/coaches/execution/big-clock-2.0/?practiceId=" +
          encodeURIComponent(practiceId) + "&session=" + encodeURIComponent(room.value) + "&fast=1";
      } else {
        sessionStorage.setItem("sandman_attendance_first_practice_id", practiceId);
        location.href = "/coaches/attendance/session.html?practiceId=" +
          encodeURIComponent(practiceId) + "&flow=builder&return=builder";
      }
      return;
    }

    const response = await createOrRecoverPractice({
      entryMode: "after-the-fact",
      locationId: room.locationId,
      roomId: room.roomId,
      sessionDateKey,
      program: program.programId,
      discipline: program.discipline,
      practiceKey
    });
    const practiceId = String(response.data?.practiceId || "").trim();
    if (!practiceId) throw new Error("Practice identity was not returned.");
    location.href = "/coaches/attendance/session.html?practiceId=" + encodeURIComponent(practiceId);
  } catch (error) {
    console.error("[practice-entry] failed", error);
    setStatus(error?.message || "Practice entry failed.", true);
  } finally {
    if (button) button.disabled = false;
  }
}

async function initialize() {
  const panel = $("entryPanel");

  try {
    const coach = await requireCoach();

    populateRooms(
      coach?.scope?.locationIds || [],
      coach?.isSystemAdmin === true
    );

    if (!$("roomSelect")?.options.length) {
      throw new Error("No permitted practice rooms are available for this Coach.");
    }

    $("entryMode").value = requestedMode();
    $("sessionDateKey").value = todayKey();

    populatePrograms();
    updateModeUI();

    $("roomSelect")?.addEventListener("change", populatePrograms);
    $("entryMode")?.addEventListener("change", updateModeUI);
    $("createPractice")?.addEventListener("click", submit);

    if (panel) panel.hidden = false;
    $("entryStatus").hidden = true;
  } catch (error) {
    console.error("[practice-entry] access failed", error);

    const status = $("entryStatus");
    if (status) {
      status.hidden = false;
      status.classList.add("is-error");
      status.replaceChildren();

      const text = document.createElement("span");
      text.textContent = (error?.message || "Coach access is required.") + " ";

      const link = document.createElement("a");
      link.href = coachLoginUrl();
      link.textContent = "Sign in as Coach";

      status.append(text, link);
    }
  }
}

void initialize();
