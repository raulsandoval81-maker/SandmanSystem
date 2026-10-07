import {
  db,
  collection,
  onSnapshot,
  getDocs,
  functions,
  httpsCallable
} from "/assets/js/firebase-init.js";

import {
  requireCoach
} from "/assets/js/coach-guard.js";

const $ = (id) => document.getElementById(id);

function localCoachLoginUrl() {
  const returnUrl = window.location.pathname + window.location.search;
  return "/coaches/auth/login.html?returnUrl=" + encodeURIComponent(returnUrl);
}

const countStrengthEl = $("count-strength");
const countHonorEl = $("count-honor");
const countConditioningEl = $("count-conditioning");
const countConditioningRequestsEl = $("count-conditioning-requests");
const countIronEl = $("count-iron");
const countRecognitionEl = $("count-recognition");
const countTestingEl = $("count-testing");
const countManagementNoticesEl = $("count-management-notices");
const managementAssessmentSummaryEl = $("management-assessment-summary");

const listStrengthEl = $("list-strength");
const listHonorEl = $("list-honor");
const listConditioningEl = $("list-conditioning");
const listTestingEl = $("list-testing");
const listRecognitionEl = $("list-recognition");

const RECOGNITION_QUEUE_ENDPOINT =
  "https://us-central1-sandmandashboard.cloudfunctions.net/testRecognitionQueue";

const listAssessmentPins =
  httpsCallable(
    functions,
    "listAthleteAssessmentPins"
  );

const OPEN_ASSESSMENT_STATUSES =
  new Set([
    "ASSESSMENT_NEEDED",
    "IN_ASSESSMENT"
  ]);
function setCount(el, value) {
  if (el) el.textContent = String(Number(value || 0));
}

function renderMiniList(el, ids = []) {
  if (!el) return;

  const unique = [...new Set(ids)].slice(0, 5);

  el.innerHTML = unique.length
    ? unique.map((id) => `<div class="mini-list__item">${id}</div>`).join("")
    : '<div class="mini-list__empty">None pending</div>';
}

function pending(status) {
  return String(status || "").trim().toLowerCase() === "pending";
}

function hasBody(entry) {
  return !!String(entry?.body || "").trim();
}

function isStrengthEntry(key, entry) {
  const k = String(key || "").trim();
  const matches =
    /^strength_segment1_session\d+$/i.test(k) ||
    /^STR-\d+$/i.test(k);

  return matches &&
    String(entry?.lane || "").trim().toLowerCase() === "strength";
}

function isHonorEntry(key, entry) {
  const k = String(key || "").trim();
  const matches =
    /^honor_segment1_session\d+$/i.test(k) ||
    /^HON-\d+$/i.test(k);

  return matches &&
    String(entry?.lane || "").trim().toLowerCase() === "honor";
}

function isConditioningEntry(key, entry) {
  const k = String(key || "").trim();
  const matches =
    /^conditioning_f4_segment1_session\d+$/i.test(k) ||
    /^conditioning_f8_segment1_session\d+$/i.test(k) ||
    /^CON-\d+$/i.test(k);

  return matches &&
    String(entry?.lane || "").trim().toLowerCase() === "conditioning";
}

function subscribeLaneCounts() {
  onSnapshot(
    collection(db, "laneSubmissions"),
    (snap) => {
      let strength = 0;
      let honor = 0;
      let conditioning = 0;
      let conditioningRequests = 0;
      let iron = 0;

      const strengthIds = [];
      const honorIds = [];
      const conditioningIds = [];

      snap.docs.forEach((docSnap) => {
        const athleteId = docSnap.id;
        const data = docSnap.data() || {};

        Object.keys(data).forEach((key) => {
          const entry = data[key];

          if (
            isStrengthEntry(key, entry) &&
            hasBody(entry) &&
            pending(entry?.status)
          ) {
            strength += 1;
            strengthIds.push(athleteId);
          }

          if (
            isHonorEntry(key, entry) &&
            hasBody(entry) &&
            pending(entry?.status)
          ) {
            honor += 1;
            honorIds.push(athleteId);
          }

          if (
            isConditioningEntry(key, entry) &&
            hasBody(entry) &&
            pending(entry?.status)
          ) {
            conditioning += 1;
            conditioningIds.push(athleteId);
          }
        });

        const conditioningRequest = data?.conditioning_request;
        if (conditioningRequest && pending(conditioningRequest.status)) {
          conditioningRequests += 1;
        }

        const hiitEntry = data?.strength_remote_hiit;
        if (hiitEntry?.submittedAt && pending(hiitEntry?.status)) {
          conditioning += 1;
          conditioningIds.push(athleteId);
        }

        const ironEntry = data?.strength_iron_latest;
        if (ironEntry?.submittedAt && pending(ironEntry?.status)) {
          iron += 1;
        }
      });

      setCount(countStrengthEl, strength);
      setCount(countHonorEl, honor);
      setCount(countConditioningEl, conditioning);
      setCount(countConditioningRequestsEl, conditioningRequests);
      setCount(countIronEl, iron);

      renderMiniList(listStrengthEl, strengthIds);
      renderMiniList(listHonorEl, honorIds);
      renderMiniList(listConditioningEl, conditioningIds);
    },
    (error) => {
      console.error("[daily-operations] lane queue failed", error);
    }
  );
}

async function refreshManagementNoticeCount() {
  try {
    const response =
      await listAssessmentPins();

    const pins =
      Array.isArray(response?.data?.pins)
        ? response.data.pins
        : Array.isArray(response?.data)
          ? response.data
          : [];

    const openAssessments =
      pins.filter((pin) =>
        OPEN_ASSESSMENT_STATUSES.has(
          String(pin?.status || "")
            .trim()
            .toUpperCase()
        )
      );

    const count =
      openAssessments.length;

    setCount(
      countManagementNoticesEl,
      count
    );

    if (managementAssessmentSummaryEl) {
      managementAssessmentSummaryEl.textContent =
        count === 0
          ? "No assessment requests pending. "
          : `${count} athlete assessment request${count === 1 ? "" : "s"} waiting. `;
    }
  } catch (error) {
    console.error(
      "[daily-operations] management assessment count failed",
      error
    );

    setCount(
      countManagementNoticesEl,
      0
    );

    if (managementAssessmentSummaryEl) {
      managementAssessmentSummaryEl.textContent =
        "Management request count unavailable. ";
    }
  }
}

function athleteDisplayName(data, athleteId) {
  return (
    String(
      data?.publicName ||
      data?.fullName ||
      data?.name ||
      athleteId ||
      ""
    ).trim() ||
    athleteId
  );
}

function athleteStripeCount(data) {
  return Math.max(
    0,
    Math.min(
      4,
      Number(
        data?.stripeCount ??
        data?.stripe ??
        0
      ) || 0
    )
  );
}

function athleteTierXp(data) {
  return Math.max(
    0,
    Number(
      data?.xp ??
      data?.activeTierXp ??
      data?.tierXp ??
      0
    ) || 0
  );
}

function athleteXpCap(data) {
  return Math.max(
    0,
    Number(
      data?.xpCap ??
      data?.tierCap ??
      0
    ) || 0
  );
}

function isCurrentAthlete(data) {
  const rosterStatus =
    String(
      data?.rosterStatus ||
      data?.status ||
      ""
    )
      .trim()
      .toLowerCase();

  if (
    rosterStatus &&
    ![
      "current",
      "active",
      "approved"
    ].includes(rosterStatus)
  ) {
    return false;
  }

  return !(
    data?.isDev === true ||
    data?.devMode === true ||
    data?.isTest === true
  );
}

function renderRecognitionItems() {
  // Daily Operations intentionally shows only the queue count.
  // Athlete-level recognition detail belongs to the Certificate Queue.
}

async function refreshRecognitionQueue(user) {
  if (!user) return { queue: { testing: [] } };

  const athleteSnapshot =
    await getDocs(
      collection(db, "athletes")
    );

  let serverData = null;
  let readyItems = [];

  try {
    const token =
      await user.getIdToken();

    const response =
      await fetch(
        RECOGNITION_QUEUE_ENDPOINT,
        {
          headers: {
            Authorization:
              `Bearer ${token}`
          }
        }
      );

    if (response.ok) {
      const data =
        await response.json();

      if (data?.ok) {
        serverData = data;
        readyItems =
          Array.isArray(
            data?.queue?.stripeAwards
          )
            ? data.queue.stripeAwards
            : [];
      }
    }
  } catch (error) {
    console.warn(
      "[daily-operations] recognition server unavailable; using athlete fallback",
      error
    );
  }

  const readyIds =
    new Set(
      readyItems
        .map((item) =>
          String(
            item?.athleteUid ||
            ""
          ).trim()
        )
        .filter(Boolean)
    );

  const ready =
    readyItems.map((item) => ({
      status: "ready",
      athleteUid:
        String(
          item?.athleteUid ||
          ""
        ).trim(),
      athleteName:
        String(
          item?.athleteName ||
          item?.athleteUid ||
          "Athlete"
        ).trim(),
      stripe:
        Math.max(
          1,
          Number(
            item?.decision?.stripe ||
            1
          ) || 1
        ),
      remaining: 0
    }));

  const approaching = [];
  const localTesting = [];

  athleteSnapshot.docs.forEach((docSnap) => {
    const athleteUid =
      docSnap.id;

    const athlete =
      docSnap.data() || {};

    if (!isCurrentAthlete(athlete)) {
      return;
    }

    const xpCap =
      athleteXpCap(athlete);

    const xp =
      athleteTierXp(athlete);

    const currentStripe =
      athleteStripeCount(athlete);

    if (
      !readyIds.has(athleteUid) &&
      xpCap > 0 &&
      currentStripe < 4
    ) {
      const nextStripe =
        currentStripe + 1;

      const threshold =
        Math.ceil(
          (xpCap * nextStripe) / 4
        );

      const remaining =
        threshold - xp;

      if (
        remaining > 0 &&
        remaining <= 50
      ) {
        approaching.push({
          status: "approaching",
          athleteUid,
          athleteName:
            athleteDisplayName(
              athlete,
              athleteUid
            ),
          stripe: nextStripe,
          remaining
        });
      }
    }

    const testing =
      athlete?.testing || {};

    const rawState =
      String(
        testing?.state || ""
      )
        .trim()
        .toUpperCase();

    let stage = "";

    if (rawState === "TESTING") {
      stage = "TESTING";
    } else if (rawState === "READY") {
      stage = "TEST_SCHEDULED";
    } else if (
      rawState === "ELIGIBLE"
    ) {
      stage = "TEST_ELIGIBLE";
    } else if (
      rawState === "TEMPLE"
    ) {
      stage = "TEMPLE";
    }

    if (stage) {
      localTesting.push({
        athleteUid,
        athleteName:
          athleteDisplayName(
            athlete,
            athleteUid
          ),
        stage,
        decision: {
          tier:
            athlete?.tier ?? "—",
          stripe:
            currentStripe
        }
      });
    }
  });

  approaching.sort(
    (a, b) =>
      a.remaining - b.remaining ||
      a.athleteName.localeCompare(
        b.athleteName
      )
  );

  const items = [
    ...ready,
    ...approaching
  ];

  setCount(
    countRecognitionEl,
    items.length
  );

  renderRecognitionItems(items);

  return {
    ...(serverData || {}),
    queue: {
      ...(serverData?.queue || {}),
      testing:
        localTesting
    }
  };
}

function testingStageLabel(stage) {
  const normalized =
    String(stage || "")
      .trim()
      .toUpperCase();

  if (normalized === "TEMPLE") {
    return "Temple";
  }

  if (normalized === "TEST_ELIGIBLE") {
    return "Ready for Test";
  }

  if (normalized === "TEST_SCHEDULED") {
    return "Test Scheduled";
  }

  if (normalized === "TESTING") {
    return "Testing";
  }

  return normalized.replaceAll("_", " ");
}

function renderTestingReadiness(recognitionData) {
  const testingItems =
    Array.isArray(
      recognitionData?.queue?.testing
    )
      ? recognitionData.queue.testing
      : [];

  setCount(
    countTestingEl,
    testingItems.length
  );
}

async function initialize() {
  const status = $("dailyStatus");
  const protectedContent =
    document.querySelector("[data-daily-protected]");

  try {
    const coachContext =
      await requireCoach();

    if (protectedContent) protectedContent.hidden = false;
    if (status) status.hidden = true;

    subscribeLaneCounts();
    await refreshManagementNoticeCount();
    const recognitionData =
      await refreshRecognitionQueue(
        coachContext?.user
      );

    renderTestingReadiness(
      recognitionData
    );
  } catch (error) {
    console.error("[daily-operations] Coach access denied", error);

    if (protectedContent) protectedContent.hidden = true;

    if (status) {
      status.classList.add("is-error");
      status.replaceChildren();

      const text = document.createElement("span");
      text.textContent = "Coach access is required to open Daily Operations. ";

      const link = document.createElement("a");
      link.href = localCoachLoginUrl();
      link.textContent = "Sign in as Coach";

      status.append(text, link);
    }
  }
}

void initialize();
