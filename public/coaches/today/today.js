import {
  db,
  collection,
  onSnapshot,
  query,
  where
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

const listStrengthEl = $("list-strength");
const listHonorEl = $("list-honor");
const listConditioningEl = $("list-conditioning");
const listTestingEl = $("list-testing");
const listRecognitionEl = $("list-recognition");

const RECOGNITION_QUEUE_ENDPOINT =
  "https://us-central1-sandmandashboard.cloudfunctions.net/testRecognitionQueue";
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

async function refreshRecognitionQueue(user) {
  if (!listRecognitionEl || !user) return;

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

    const stripeItems =
      Array.isArray(
        data?.queue?.stripeAwards
      )
        ? data.queue.stripeAwards
        : [];

    setCount(
      countRecognitionEl,
      stripeItems.length
    );

    renderMiniList(
      listRecognitionEl,
      stripeItems.map((item) =>
        String(
          item?.athleteName ||
          item?.athleteUid ||
          ""
        ).trim()
      ).filter(Boolean)
    );
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
