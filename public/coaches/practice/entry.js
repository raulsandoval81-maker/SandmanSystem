import {
  functions,
  httpsCallable
} from "/assets/js/firebase-init.js";

import {
  coachLoginUrl,
  requireCoach
} from "/assets/js/coach-guard.js";

import {
  SESSION_ROOMS
} from "/coaches/execution/session-builder/session-entry-policy.js";

const $ = (id) => document.getElementById(id);

const createOrRecoverPractice =
  httpsCallable(functions, "createOrRecoverCanonicalPractice");

let activeRoom = null;

function todayKey() {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

function requestedMode() {
  const mode = String(
    new URLSearchParams(location.search).get("mode") || ""
  ).trim().toLowerCase();

  return ["planned", "quick-start", "after-the-fact"].includes(mode) ? mode : "planned";
}

function coachDisplayName(coach = {}) {
  const staff = coach?.staff || {};
  const user = coach?.user || {};
  const explicit = [
    staff.displayName,
    staff.name,
    [staff.firstName, staff.lastName].filter(Boolean).join(" "),
    user.displayName,
    coach.email
  ].map((value) => String(value || "").trim()).find(Boolean);
  return explicit || "Signed-in Coach";
}

function resolvePracticeRoom(scopeLocationIds = [], isSystemAdmin = false) {
  const allowed = new Set(
    (scopeLocationIds || []).map((id) => String(id || "").trim().toLowerCase())
  );

  return SESSION_ROOMS.find((room) =>
    isSystemAdmin ||
    !allowed.size ||
    allowed.has(String(room.locationId || "").toLowerCase())
  ) || null;
}

function updateModeUI() {
  const mode = $("entryMode")?.value || "planned";
  const historical = mode === "after-the-fact";

  const date = $("sessionDateKey");
  if (date) {
    date.disabled = !historical;
    if (!historical) date.value = todayKey();
  }

  const button = $("createPractice");
  if (button) {
    button.textContent = mode === "quick-start"
      ? "Open Big Clock"
      : "Continue to Attendance";
  }

  const title = $("entryTitle");
  if (title) {
    title.textContent = mode === "quick-start"
      ? "Quick Start"
      : historical
        ? "Record Past Practice"
        : "Start Practice";
  }

  const description = $("entryDescription");
  if (description) {
    description.textContent = mode === "quick-start"
      ? "Open the practice and go straight to the clock."
      : historical
        ? "Choose the date, then verify who was there."
        : "Open the practice and move straight to attendance.";
  }
}

function setStatus(message, isError = false) {
  const status = $("entryStatus");
  if (!status) return;
  status.hidden = false;
  status.textContent = message;
  status.classList.toggle("is-error", isError);
}

function persistSession(practiceId, room, mode) {
  const session = {
    practiceId,
    sessionId: room.value,
    roomValue: room.value,
    locationId: room.locationId,
    academyId: room.locationId,
    roomId: room.roomId,
    discipline: "unassigned",
    journey: "",
    program: "",
    track: "",
    schema: mode === "quick-start" ? "fast-practice" : "academy-60",
    executionMode: mode === "quick-start" ? "manual" : "hybrid",
    durationMinutes: 60,
    source: mode === "quick-start" ? "session-builder-fast-pass" : "attendance-first",
    createdAt: new Date().toISOString()
  };
  localStorage.setItem("sandman_session_builder_v1", JSON.stringify(session));
  return session;
}

async function submit() {
  const mode = $("entryMode")?.value || "planned";
  const historical = mode === "after-the-fact";
  const room = activeRoom;
  const sessionDateKey = historical ? ($("sessionDateKey")?.value || "") : todayKey();

  if (!room) {
    setStatus("No permitted practice location is available for this Coach.", true);
    return;
  }

  if (!sessionDateKey) {
    setStatus("Choose the practice date.", true);
    return;
  }

  const button = $("createPractice");
  if (button) button.disabled = true;

  try {
    setStatus(historical ? "Opening past practice…" : "Opening practice…");

    let practiceId = "";

    if (historical) {
      const response = await createOrRecoverPractice({
        entryMode: "after-the-fact",
        locationId: room.locationId,
        roomId: room.roomId,
        sessionDateKey,
        program: "attendance-routed",
        discipline: "unassigned",
        practiceKey: `rush-${room.value}`
      });
      practiceId = String(response.data?.practiceId || "").trim();
    } else {
      const openPractice = httpsCallable(functions, "openPracticeSession");
      const response = await openPractice({
        liveSessionId: room.value,
        locationId: room.locationId,
        academyId: room.locationId,
        roomId: room.roomId,
        sessionDateKey,
        discipline: "unassigned",
        journey: "",
        program: "",
        track: "",
        schema: mode === "quick-start" ? "fast-practice" : "academy-60",
        executionMode: mode === "quick-start" ? "manual" : "hybrid",
        durationMinutes: 60
      });
      practiceId = String(response.data?.practiceId || "").trim();
    }

    if (!practiceId) throw new Error("Practice identity was not returned.");

    persistSession(practiceId, room, mode);

    if (mode === "quick-start") {
      localStorage.setItem("sandman_big_clock_payload_v2", JSON.stringify({
        source: "session-builder-fast-pass",
        practiceId,
        sessionId: room.value,
        durationMinutes: 60,
        blocks: [{ title: "Practice", minutes: 60, cards: [], notes: "", drillBlocks: [] }]
      }));
      location.href = "/coaches/execution/big-clock-2.0/?practiceId=" +
        encodeURIComponent(practiceId) + "&session=" + encodeURIComponent(room.value) + "&fast=1";
      return;
    }

    sessionStorage.setItem("sandman_attendance_first_practice_id", practiceId);
    location.href = "/coaches/attendance/session.html?practiceId=" +
      encodeURIComponent(practiceId) + "&flow=builder&return=builder";
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

    activeRoom = resolvePracticeRoom(
      coach?.scope?.locationIds || [],
      coach?.isSystemAdmin === true
    );

    if (!activeRoom) {
      throw new Error("No permitted practice location is available for this Coach.");
    }

    if ($("coachOnHand")) $("coachOnHand").value = coachDisplayName(coach);
    $("entryMode").value = requestedMode();
    $("sessionDateKey").value = todayKey();

    updateModeUI();

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
