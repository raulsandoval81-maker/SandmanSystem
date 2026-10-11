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
const PRACTICE_ENTRY_KEY = "sandman_practice_entry_v1";

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

function updateEntryUI() {
  const mode = requestedMode();
  const historical = mode === "after-the-fact";

  const date = $("sessionDateKey");
  if (date) {
    date.disabled = mode !== "after-the-fact";
    if (!historical) date.value = todayKey();
  }

  const button = $("createPractice");
  if (button) {
    button.textContent = mode === "planned"
      ? "Continue to Session Builder"
      : mode === "quick-start"
        ? "Continue to Quick Start"
        : "Continue to Past Practice";
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
    description.textContent = mode === "planned"
      ? "Confirm the practice date and Coach, then continue to Session Builder."
      : mode === "quick-start"
        ? "Confirm the Coach, then continue the quick-start practice flow."
        : "Choose the real practice date and confirm the Coach before recovering the practice.";
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
  const mode = requestedMode();
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
    if (mode === "planned") {
      sessionStorage.setItem(PRACTICE_ENTRY_KEY, JSON.stringify({
        mode,
        sessionDateKey,
        coachName: $("coachOnHand")?.value || "",
        roomValue: room.value,
        roomId: room.roomId,
        locationId: room.locationId,
        createdAt: new Date().toISOString()
      }));
      location.href = "/coaches/execution/session-builder/?from=practice-entry";
      return;
    }

    if (historical) {
      sessionStorage.setItem(PRACTICE_ENTRY_KEY, JSON.stringify({
        mode: "after-the-fact",
        sessionDateKey,
        coachName: $("coachOnHand")?.value || "",
        roomValue: room.value,
        roomId: room.roomId,
        locationId: room.locationId,
        createdAt: new Date().toISOString()
      }));
      location.href = "/coaches/execution/session-builder/?from=practice-entry&historical=1";
      return;
    }

    throw new Error("Unsupported Practice Entry mode.");
  } catch (error) {
    console.error("[practice-entry] failed", error);
    setStatus(error?.message || "Practice entry failed.", true);
  } finally {
    if (button) button.disabled = false;
  }
}

async function initialize() {
  if (requestedMode() === "planned" || requestedMode() === "quick-start") {
    location.replace("/coaches/practice/");
    return;
  }

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
    $("sessionDateKey").value = todayKey();

    updateEntryUI();

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
