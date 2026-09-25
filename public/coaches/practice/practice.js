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

const flows = {
  normal: {
    title: "Normal Practice",
    description:
      "Use the full live workflow when the room has time for check-in, planning, and active execution.",

    startHeading: "Run the Full Live Start",
    startDescription:
      "Check athletes in, build the session, then run the active practice.",

    steps: [
      {
        title: "Check In",
        description: "Record athletes as they arrive."
      },
      {
        title: "Build Session",
        description: "Choose the practice structure."
      },
      {
        title: "Run Practice",
        description: "Coach the active session."
      }
    ],

    actions: [
      {
        label: "Start Check-In",
        href: "/coaches/attendance/session.html",
        primary: true
      },
      {
        label: "Session Builder",
        href: "/coaches/execution/session-builder/"
      },
      {
        label: "Run Practice",
        href: "/coaches/execution/clipboard-2.0/"
      }
    ]
  },

  "coach-directed": {
    title: "Coach-Directed / Free Day",
    description:
      "Use this when the coach needs to run the room directly without building a formal session first.",

    startHeading: "Check In, Then Coach the Room",
    startDescription:
      "Check athletes in, intentionally bypass the Builder, and run the practice under coach direction.",

    steps: [
      {
        title: "Check In",
        description: "Record athletes as they arrive."
      },
      {
        title: "Skip Builder",
        description: "Intentional Builder bypass."
      },
      {
        title: "Run Practice",
        description: "Coach the room directly."
      }
    ],

    actions: [
      {
        label: "Start Check-In",
        href: "/coaches/attendance/session.html",
        primary: true
      },
      {
        label: "Attendance",
        href: "/coaches/attendance/"
      },
      {
        label: "Practice Log",
        href: "/coaches/logs/practice-log.html"
      }
    ]
  },

  "after-the-fact": {
    title: "After-the-Fact / Rush Day",
    description:
      "Use this when the practice already happened and the coach needs to reconstruct the actual session afterward.",

    startHeading: "Reconstruct the Actual Practice",
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
        label: "Reconstruct Practice",
        href: "/coaches/attendance/",
        primary: true
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

  startFlowHeading.textContent = flow.startHeading;
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

  choicePanel.hidden = true;
  activeFlow.hidden = false;

  sessionStorage.setItem(FLOW_STORAGE_KEY, flowId);

  if (options.scroll !== false) {
    activeFlow.scrollIntoView({
      behavior: "smooth",
      block: "start"
    });
  }
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
    renderFlow(choice.dataset.practiceFlow);
  });
});

changePracticeFlow?.addEventListener("click", resetFlow);

const savedFlow = sessionStorage.getItem(FLOW_STORAGE_KEY);

if (savedFlow && flows[savedFlow]) {
  renderFlow(savedFlow, {
    scroll: false
  });
}