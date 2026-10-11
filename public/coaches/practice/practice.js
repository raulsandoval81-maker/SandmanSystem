import {
  coachLoginUrl,
  requireCoach
} from "/assets/js/coach-guard.js";

import {
  SESSION_ROOMS
} from "/coaches/execution/session-builder/session-entry-policy.js";

import {
  functions,
  httpsCallable
} from "/assets/js/firebase-init.js";

const choicePanel = document.getElementById("practiceChoicePanel");
const activeFlow = document.getElementById("activePracticeFlow");

const activeFlowTitle = document.getElementById("activeFlowTitle");
const activeFlowDescription = document.getElementById("activeFlowDescription");

const startFlowHeading = document.getElementById("startFlowHeading");
const startFlowDescription = document.getElementById("startFlowDescription");
const startFlowSteps = document.getElementById("startFlowSteps");
const startFlowActions = document.getElementById("startFlowActions");

const changePracticeFlow = document.getElementById("changePracticeFlow");

const choices = Array.from(
  document.querySelectorAll("[data-practice-flow]")
);

const FLOW_STORAGE_KEY = "sandman.coach.practice.flow";
const PRACTICE_ENTRY_KEY = "sandman_practice_entry_v1";

let activeRoom = null;

function todayKey() {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

function coachDisplayName(coach = {}) {
  const staff = coach?.staff || {};
  const user = coach?.user || {};
  return [
    staff.preferredName,
    staff.displayName,
    staff.fullName,
    staff.name,
    [staff.firstName, staff.lastName].filter(Boolean).join(" "),
    user.displayName,
    coach.email
  ].map((value) => String(value || "").trim()).find(Boolean) || "Signed-in Coach";
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

const QUICK_START_STANDARD_BLOCKS = Object.freeze([
  { slot: "onmat", title: "Announcements / On The Mat Talk", minutes: 2, cards: [], notes: "", drillBlocks: [] },
  { slot: "warmup", title: "Warm Up / Body Mechanics", minutes: 8, cards: [], notes: "", drillBlocks: [] },
  { slot: "drills", title: "Review of Prior Week’s Skills", minutes: 10, cards: [], notes: "", drillBlocks: [] },
  { slot: "technique", title: "Introduction of New Techniques", minutes: 15, cards: [], notes: "", drillBlocks: [] },
  { slot: "water", title: "Water Break", minutes: 2, cards: [], notes: "", drillBlocks: [] },
  { slot: "live", title: "Live Session", minutes: 15, cards: [], notes: "", drillBlocks: [] },
  { slot: "cond", title: "Conditioning / Skill Based Activities", minutes: 5, cards: [], notes: "", drillBlocks: [] },
  { slot: "offmat", title: "Roll Call / Off The Mat Talk", minutes: 3, cards: [], notes: "", drillBlocks: [] }
]);

async function openQuickStartPractice(choice) {
  if (!activeRoom) return;
  choice.disabled = true;

  try {
    const dateEl = document.getElementById("practiceDate");
    const sessionDateKey = String(dateEl && dateEl.dataset.value || todayKey());
    const openPractice = httpsCallable(functions, "openPracticeSession");
    const response = await openPractice({
      liveSessionId: activeRoom.value,
      locationId: activeRoom.locationId,
      academyId: activeRoom.locationId,
      roomId: activeRoom.roomId,
      sessionDateKey,
      discipline: "unassigned",
      journey: "",
      program: "",
      track: "",
      tier: "",
      week: "",
      schema: "academy-60",
      executionMode: "manual",
      durationMinutes: 60
    });

    const practiceId = String(response.data && response.data.practiceId || "").trim();
    if (!practiceId) throw new Error("Practice identity was not returned.");

    const session = {
      practiceId,
      sessionId: activeRoom.value,
      roomValue: activeRoom.value,
      locationId: activeRoom.locationId,
      academyId: activeRoom.locationId,
      roomId: activeRoom.roomId,
      discipline: "unassigned",
      journey: "",
      program: "",
      track: "",
      schema: "academy-60",
      executionMode: "manual",
      durationMinutes: 60,
      source: "quick-start-standard",
      sessionDateKey,
      createdAt: new Date().toISOString()
    };

    const clockPayload = {
      source: "quick-start-standard",
      practiceId,
      sessionId: activeRoom.value,
      executionMode: "manual",
      schema: "academy-60",
      durationMinutes: 60,
      blocks: QUICK_START_STANDARD_BLOCKS.map((block) => ({ ...block }))
    };

    localStorage.removeItem("sandman_run_state");
    localStorage.removeItem("sandman_clipboard_v1");
    localStorage.removeItem("sandman_clipboard_draft_v1");
    localStorage.setItem("sandman_session_builder_v1", JSON.stringify(session));
    localStorage.setItem("sandman_big_clock_payload_v2", JSON.stringify(clockPayload));

    const saveMemory = httpsCallable(functions, "savePracticeSessionMemory");
    await saveMemory({
      operation: "plan",
      practiceId,
      planVersion: 1,
      plannedBlocks: QUICK_START_STANDARD_BLOCKS.map((block) => ({
        blockId: block.slot,
        title: block.title,
        minutes: block.minutes,
        cards: []
      })),
      plannedCards: []
    });

    window.location.assign(
      "/coaches/execution/big-clock-2.0/?practiceId=" +
      encodeURIComponent(practiceId) +
      "&session=" +
      encodeURIComponent(activeRoom.value)
    );
  } catch (error) {
    console.error("[practice] Quick Start failed", error);
    choice.disabled = false;

    const notice = document.createElement("section");
    notice.className = "practice-note";
    notice.setAttribute("role", "alert");
    notice.textContent = error && error.message ? error.message : "Quick Start could not open Big Clock.";
    document.querySelector(".practice-page")?.prepend(notice);
  }
}

function openPlannedPractice() {
  const dateEl = document.getElementById("practiceDate");
  const coachEl = document.getElementById("practiceCoach");
  const date = String(dateEl?.dataset.value || todayKey());
  const coachName = String(coachEl?.textContent || "").trim();

  if (!activeRoom) return;

  sessionStorage.setItem(PRACTICE_ENTRY_KEY, JSON.stringify({
    mode: "planned",
    sessionDateKey: date,
    coachName,
    roomValue: activeRoom.value,
    roomId: activeRoom.roomId,
    locationId: activeRoom.locationId,
    createdAt: new Date().toISOString()
  }));

  window.location.assign("/coaches/execution/session-builder/?from=practice-entry");
}

const flows = {
  normal: {
    title: "Plan Workout",
    description:
      "Confirm the practice date and Coach, then use Session Builder before attendance and execution.",

    startHeading: "Plan Workout",
    startDescription:
      "Start Practice establishes the date and Coach. Session Builder then owns the practice setup before attendance.",

    steps: [
      {
        title: "Start Practice",
        description: "Confirm the practice date and Coach."
      },
      {
        title: "Session Builder",
        description: "Choose the session, route, length, and build mode."
      },
      {
        title: "Attendance",
        description: "Check in the athletes who are actually in the room."
      },
      {
        title: "Run Practice",
        description: "Continue through the Pre-Practice Clipboard and live execution."
      }
    ],

    actions: [
      {
        label: "Plan Workout",
        href: "/coaches/practice/entry.html?mode=planned",
        primary: true
      },
      {
        label: "Resume Check-In",
        href: "/coaches/attendance/session.html"
      },
      {
        label: "Practice Clipboard",
        href: "/coaches/execution/clipboard-2.0/"
      }
    ]
  },

  "coach-directed": {
    title: "Quick Start Practice",
    description:
      "Open Big Clock immediately in Manual mode using the standard 60-minute practice structure.",

    startHeading: "Quick Start",
    startDescription:
      "Create the canonical practice and run the standard practice structure directly in Big Clock.",

    steps: [
      {
        title: "Create Practice",
        description: "Establish the canonical practice record."
      },
      {
        title: "Big Clock",
        description: "Run the standard practice structure in Manual mode."
      }
    ],

    actions: [
      {
        label: "Create Direct Practice",
        href: "/coaches/practice/entry.html?mode=coach-directed",
        primary: true
      },
      {
        label: "Review Attendance",
        href: "/coaches/attendance/"
      },
      {
        label: "Practice Log",
        href: "/coaches/logs/practice-log.html"
      }
    ]
  },

  "after-the-fact": {
    title: "Record Past Practice",
    description:
      "Record a practice that already happened, using its real date, discipline, and participating athletes.",

    startHeading: "Record a Past Practice",
    startDescription:
      "Do not create fake historical check-ins. Recover the practice, confirm the real date and discipline, and identify who actually trained.",

    steps: [
      {
        title: "Create / Recover Practice",
        description: "Establish the canonical practice record."
      },
      {
        title: "Confirm Date + Discipline",
        description: "Record what actually happened."
      },
      {
        title: "Select Participants",
        description: "Choose the athletes who actually practiced."
      }
    ],

    actions: [
      {
        label: "Recover Past Practice",
        href: "/coaches/practice/entry.html?mode=after-the-fact",
        primary: true
      },
      {
        label: "Review Attendance",
        href: "/coaches/attendance/"
      },
      {
        label: "Practice Log",
        href: "/coaches/logs/practice-log.html"
      }
    ]
  }
};

function clearElement(element) {
  while (element.firstChild) {
    element.removeChild(element.firstChild);
  }
}

function buildStep(step) {
  const item = document.createElement("li");
  item.className = "flow-step";

  const strong = document.createElement("strong");
  strong.textContent = step.title;

  const description = document.createElement("span");
  description.textContent = step.description;

  item.append(strong, description);

  return item;
}

function buildArrow() {
  const arrow = document.createElement("li");
  arrow.className = "flow-arrow";
  arrow.setAttribute("aria-hidden", "true");
  arrow.textContent = "→";

  return arrow;
}

function buildAction(action) {
  const link = document.createElement("a");

  link.className = action.primary
    ? "flow-action flow-action--primary"
    : "flow-action";

  link.href = action.href;
  link.textContent = action.label;

  return link;
}

function markSelected(flowId) {
  choices.forEach((choice) => {
    const selected = choice.dataset.practiceFlow === flowId;

    choice.classList.toggle("is-selected", selected);
    choice.setAttribute(
      "aria-pressed",
      selected ? "true" : "false"
    );
  });
}

function renderFlow(flowId, options = {}) {
  const flow = flows[flowId];

  if (!flow) {
    return;
  }

  markSelected(flowId);

  activeFlowTitle.textContent = flow.title;
  activeFlowDescription.textContent = flow.description;

  if (startFlowHeading) startFlowHeading.textContent = flow.startHeading;
  startFlowDescription.textContent = flow.startDescription;

  clearElement(startFlowSteps);
  clearElement(startFlowActions);

  flow.steps.forEach((step, index) => {
    if (index > 0) {
      startFlowSteps.appendChild(buildArrow());
    }

    startFlowSteps.appendChild(buildStep(step));
  });

  flow.actions.forEach((action) => {
    startFlowActions.appendChild(buildAction(action));
  });

  choicePanel.hidden = false;
  activeFlow.hidden = false;

  // Keep all three start choices visible. No floating panel or auto-scroll.
}

function resetFlow() {
  sessionStorage.removeItem(FLOW_STORAGE_KEY);

  choices.forEach((choice) => {
    choice.classList.remove("is-selected");
    choice.setAttribute("aria-pressed", "false");
  });

  activeFlow.hidden = true;
  choicePanel.hidden = false;

  choicePanel.scrollIntoView({
    behavior: "smooth",
    block: "start"
  });
}

choices.forEach((choice) => {
  choice.setAttribute("aria-pressed", "false");

  choice.addEventListener("click", () => {
    const flowId = choice.dataset.practiceFlow;

    if (flowId === "normal") {
      openPlannedPractice();
      return;
    }

    if (flowId === "coach-directed") {
      void openQuickStartPractice(choice);
      return;
    }

    if (flowId === "after-the-fact") {
      window.location.assign("/coaches/practice/entry.html?mode=after-the-fact");
    }
  });
});

changePracticeFlow?.addEventListener("click", resetFlow);

async function initializePracticeOperations() {
  const page = document.querySelector(".practice-page");
  const protectedSections = page ? [...page.children] : [];

  protectedSections.forEach((element) => {
    element.hidden = true;
  });

  const notice = document.createElement("section");
  notice.className = "practice-note";
  notice.setAttribute("role", "status");
  notice.setAttribute("aria-live", "polite");
  notice.textContent = "Verifying Coach access…";

  page?.prepend(notice);

  try {
    const coach = await requireCoach();

    activeRoom = resolvePracticeRoom(
      coach?.scope?.locationIds || [],
      coach?.isSystemAdmin === true
    );

    if (!activeRoom) {
      throw new Error("No permitted practice location is available for this Coach.");
    }

    const practiceDate = document.getElementById("practiceDate");
    const practiceCoach = document.getElementById("practiceCoach");
    if (practiceDate) {
      const dateKey = todayKey();
      practiceDate.dataset.value = dateKey;
      practiceDate.textContent = new Date(dateKey + "T12:00:00").toLocaleDateString();
    }
    if (practiceCoach) practiceCoach.textContent = coachDisplayName(coach);

    notice.remove();

    protectedSections.forEach((element) => {
      element.hidden = false;
    });

    activeFlow.hidden = true;
    choicePanel.hidden = false;
  } catch (error) {
    notice.replaceChildren();

    const text = document.createElement("span");
    text.textContent =
      "Coach access is required to open Practice Operations. ";

    const link = document.createElement("a");
    link.href = coachLoginUrl();
    link.textContent = "Sign in as Coach";

    notice.append(text, link);
  }
}

void initializePracticeOperations();