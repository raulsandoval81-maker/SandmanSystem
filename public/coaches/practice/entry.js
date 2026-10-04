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

  return mode === "after-the-fact"
    ? "after-the-fact"
    : "coach-directed";
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

  if (title) {
    title.textContent =
      mode === "after-the-fact"
        ? "Recover Past Practice"
        : "Coach-Directed Practice";
  }

  if (description) {
    description.textContent =
      mode === "after-the-fact"
        ? "Create or recover one historical canonical practice, then verify who actually trained."
        : "Create or recover today’s Coach-directed canonical practice before athlete check-in.";
  }
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
  const sessionDateKey = $("sessionDateKey")?.value || "";
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

    const response = await createOrRecoverPractice({
      entryMode: mode,
      locationId: room.locationId,
      roomId: room.roomId,
      sessionDateKey,
      program: program.programId,
      discipline: program.discipline,
      practiceKey: mode === "after-the-fact" ? practiceKey : ""
    });

    const practiceId = String(response.data?.practiceId || "").trim();

    if (!practiceId) {
      throw new Error("Practice identity was not returned.");
    }

    location.href =
      "/coaches/attendance/session.html?practiceId=" +
      encodeURIComponent(practiceId);
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
