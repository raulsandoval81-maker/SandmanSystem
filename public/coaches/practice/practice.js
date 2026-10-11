import {
  coachLoginUrl,
  requireCoach
} from "/assets/js/coach-guard.js";

import {
  SESSION_ROOMS
} from "/coaches/execution/session-builder/session-entry-policy.js";

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
    staff.displayName,
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

function openPlannedPractice() {
  const date = document.getElementById("practiceDate")?.value || todayKey();
  const coachName = document.getElementById("practiceCoach")?.value || "";

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
      "Start today's practice without a formal Clipboard build. Keep attendance and the practice record connected.",

    startHeading: "Start Practice Now",
    startDescription:
      "Create the practice record, check athletes in, and coach the room without a formal Clipboard plan.",

    steps: [
      {
        title: "Create Practice",
        description: "Establish the canonical Coach-directed record."
      },
      {
        title: "Check In",
        description: "Record athletes against that practice."
      },
      {
        title: "Coach the Room",
        description: "Run the session directly."
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

    const paths = {
      "coach-directed": "/coaches/practice/entry.html?mode=quick-start",
      "after-the-fact": "/coaches/practice/entry.html?mode=after-the-fact"
    };
    const destination = paths[flowId];
    if (destination) window.location.assign(destination);
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
    if (practiceDate) practiceDate.value = todayKey();
    if (practiceCoach) practiceCoach.value = coachDisplayName(coach);

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