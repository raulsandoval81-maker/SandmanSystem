import {
  db,
  collection,
  onSnapshot,
  query,
  where,
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

function renderRecognitionItems(items) {
  if (!listRecognitionEl) return;

  if (!items.length) {
    listRecognitionEl.innerHTML =
      '<div class="mini-list__empty">No athletes within 50 XP of a stripe.</div>';
    return;
  }

  listRecognitionEl.innerHTML =
    items.slice(0, 8).map((item) => {
      const ready =
        item.status === "ready";

      const detail =
        ready
          ? `Stripe ${item.stripe} earned · Certificate ready`
          : `${item.remaining} XP to Stripe ${item.stripe}`;

      const action =
        ready
          ? `
            <a
              class="recognition-action"
              href="/coaches/ceremonies/certificates/generator.html?uid=${encodeURIComponent(item.athleteUid)}"
            >
              Generate Certificate
            </a>
          `
          : "";

      return `
        <div class="recognition-item recognition-item--${ready ? "ready" : "approaching"}">
          <div>
            <strong>${item.athleteName}</strong>
            <span>${detail}</span>
          </div>
          ${action}
        </div>
      `;
    }).join("");
}

async function refreshRecognitionQueue(user) {
  if (!listRecognitionEl || !user) return;

  try {
    const token =
      await user.getIdToken();

    const [response, athleteSnapshot] =
      await Promise.all([
        fetch(
          RECOGNITION_QUEUE_ENDPOINT,
          {
            headers: {
              Authorization:
                `Bearer ${token}`
            }
          }
        ),
        getDocs(
          collection(db, "athletes")
        )
      ]);

    if (!response.ok) {
      throw new Error(
        `Recognition queue failed: ${response.status}`
      );
    }

    const data =
      await response.json();

    if (!data?.ok) {
      throw new Error(
        data?.error ||
        "Recognition queue unavailable."
      );
    }

    const readyItems =
      Array.isArray(
        data?.queue?.stripeAwards
      )
        ? data.queue.stripeAwards
        : [];

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

    athleteSnapshot.docs.forEach((docSnap) => {
      const athleteUid =
        docSnap.id;

      if (readyIds.has(athleteUid)) {
        return;
      }

      const athlete =
        docSnap.data() || {};

      if (!isCurrentAthlete(athlete)) {
        return;
      }

      const xpCap =
        athleteXpCap(athlete);

      if (xpCap <= 0) {
        return;
      }

      const currentStripe =
        athleteStripeCount(athlete);

      if (currentStripe >= 4) {
        return;
      }

      const nextStripe =
        currentStripe + 1;

      const threshold =
        Math.ceil(
          (xpCap * nextStripe) / 4
        );

      const xp =
        athleteTierXp(athlete);

      const remaining =
        threshold - xp;

      if (
        remaining <= 0 ||
        remaining > 50
      ) {
        return;
      }

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
  } catch (error) {
    console.error(
      "[daily-operations] recognition queue failed",
      error
    );

    setCount(
      countRecognitionEl,
      0
    );

    if (listRecognitionEl) {
      listRecognitionEl.innerHTML =
        '<div class="mini-list__empty">Recognition queue unavailable</div>';
    }
  }
}

function subscribeTestingReady() {
  if (!listTestingEl) return;

  const readyQuery = query(
    collection(db, "athletes"),
    where("testing.state", "==", "READY")
  );

  onSnapshot(
    readyQuery,
    (snap) => {
      if (!snap.size) {
        listTestingEl.innerHTML =
          '<p class="muted">No athletes are currently marked READY.</p>';
        return;
      }

      listTestingEl.innerHTML = snap.docs.map((docSnap) => {
        const data = docSnap.data() || {};
        const athleteId = docSnap.id;
        const name =
          data.publicName ||
          data.fullName ||
          data.name ||
          athleteId;

        const testDate =
          data?.testing?.scheduledDate ||
          "No date set";

        return `
          <article class="testing-row">
            <div>
              <strong>${name}</strong>
              <span>${data.tier || data.rankName || "—"} · READY · ${testDate}</span>
            </div>
            <div class="testing-actions">
              <a href="/coaches/athletes/athlete.html?id=${encodeURIComponent(athleteId)}">Track</a>
              <a href="/coaches/testing/coach-athlete-panel.html?id=${encodeURIComponent(athleteId)}&v=2">Review</a>
            </div>
          </article>
        `;
      }).join("");
    },
    (error) => {
      console.error("[daily-operations] testing queue failed", error);
      listTestingEl.innerHTML =
        '<p class="muted">Testing queue unavailable.</p>';
    }
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
    await refreshRecognitionQueue(
      coachContext?.user
    );
    subscribeTestingReady();
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
