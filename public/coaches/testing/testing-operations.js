import {
  db,
  collection,
  getDocs,
  doc,
  updateDoc,
  serverTimestamp
} from "/assets/js/firebase-init.js";
import { requireCoach } from "/assets/js/coach-guard.js";

const ENDPOINT = "https://us-central1-sandmandashboard.cloudfunctions.net/testRecognitionQueue";
const $ = (id) => document.getElementById(id);
const clean = (v) => String(v ?? "").trim();

function esc(v="") {
  return String(v)
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;");
}

function nameOf(a, uid) {
  return clean(a?.publicName || a?.fullName || a?.name) || uid;
}

function panelUrl(uid) {
  return "/coaches/testing/coach-athlete-panel.html?id=" + encodeURIComponent(uid);
}

function render(el, rows, emptyText) {
  el.innerHTML = rows.length ? rows.join("") : `<div class="testing-ops-empty">${esc(emptyText)}</div>`;
}

function isCurrentRosterAthlete(a = {}) {
  const status =
    clean(
      a?.rosterStatus ||
      a?.status
    ).toLowerCase();

  if (
    status &&
    ![
      "current",
      "active",
      "approved"
    ].includes(status)
  ) {
    return false;
  }

  return !(
    a?.isDev === true ||
    a?.devMode === true ||
    a?.isTest === true
  );
}

function athleteWatchCard(uid, a) {
  return `
    <article class="testing-ops-card testing-ops-card--watch">
      <div>
        <span class="testing-ops-stage">Coach Watch</span>
        <h3>${esc(nameOf(a, uid))}</h3>
        <p>
          ${esc(uid)}
          · ${esc(a?.rankName || a?.tier || "—")}
          · ${Number(a?.xp || 0)} XP
        </p>
      </div>

      <div class="testing-ops-actions">
        <a href="/coaches/athletes/athlete.html?id=${encodeURIComponent(uid)}">
          Athlete
        </a>
        <button
          class="testing-watch-remove"
          type="button"
          data-watch-remove="${esc(uid)}"
        >
          Return to Roster
        </button>
      </div>
    </article>
  `;
}


async function init() {
  const status = $("testingStatus");
  const readinessEl = $("readinessQueue");
  const scheduledEl = $("scheduledQueue");
  const activeEl = $("activeQueue");
  const countTotalEl = $("countTestingTotal");
  const countReadinessEl = $("countTestingReadiness");
  const countScheduledEl = $("countTestingScheduled");
  const countActiveEl = $("countTestingActive");
  const countWatchEl = $("countTestingWatch");
  const rosterSelectEl = $("testingRosterSelect");
  const addWatchBtn = $("addTestingWatchBtn");
  const watchListEl = $("testingWatchList");
  const watchStatusEl = $("testingWatchStatus");

  try {
    const coach = await requireCoach();
    const token = await coach.user.getIdToken();

    const athleteSnap =
      await getDocs(
        collection(db, "athletes")
      );

    let queueData = null;

    try {
      const queueResponse =
        await fetch(
          ENDPOINT,
          {
            headers: {
              Authorization:
                `Bearer ${token}`
            }
          }
        );

      if (queueResponse.ok) {
        const data =
          await queueResponse.json();

        if (data?.ok) {
          queueData = data;
        }
      }
    } catch (error) {
      console.warn(
        "[testing-operations] recognition service unavailable; using athlete fallback",
        error
      );
    }

    const athletes =
      new Map(
        athleteSnap.docs.map((d) => [
          d.id,
          d.data() || {}
        ])
      );

    const readinessByUid =
      new Map();

    const scheduled = [];
    const active = [];

    const serverTesting =
      Array.isArray(
        queueData?.queue?.testing
      )
        ? queueData.queue.testing
        : [];

    serverTesting.forEach((item) => {
      const stage =
        clean(item?.stage).toUpperCase();

      if (
        ![
          "TEMPLE",
          "TEST_ELIGIBLE"
        ].includes(stage)
      ) {
        return;
      }

      const uid =
        clean(item?.athleteUid);

      readinessByUid.set(
        uid,
        stage
      );
    });

    athletes.forEach((a, uid) => {
      const state =
        clean(
          a?.testing?.state
        ).toUpperCase();

      if (
        state === "ELIGIBLE"
      ) {
        readinessByUid.set(
          uid,
          "TEST_ELIGIBLE"
        );
      } else if (
        state === "TEMPLE"
      ) {
        readinessByUid.set(
          uid,
          "TEMPLE"
        );
      }

      const params =
        new URLSearchParams({
          uid,
          athleteName:
            nameOf(a,uid),
          tier:
            clean(
              a?.tier || "T0"
            ),
          track:
            uid.startsWith("F8_")
              ? "foundry8-combat"
              : "foundry4-combat"
        });

      const scheduledDate =
        clean(
          a?.testing?.scheduledDate
        );

      if (scheduledDate) {
        params.set(
          "testDate",
          scheduledDate
        );
      }

      const setup =
        "/coaches/testing/testing-command-center.html?" +
        params.toString();

      const sheet =
        "/coaches/testing/coach-sheet.html?" +
        params.toString();

      if (state === "READY") {
        scheduled.push(
          `<article class="testing-ops-card"><div><span class="testing-ops-stage">Test Scheduled</span><h3>${esc(nameOf(a,uid))}</h3><p>${esc(uid)} · ${esc(a?.testing?.scheduledDate || "Date not set")}</p></div><div class="testing-ops-actions"><a href="${panelUrl(uid)}">Athlete Review</a><a href="${setup}">Prepare Test</a><a href="${sheet}">Coach Sheet</a></div></article>`
        );
      }

      if (state === "TESTING") {
        active.push(
          `<article class="testing-ops-card"><div><span class="testing-ops-stage">Testing In Progress</span><h3>${esc(nameOf(a,uid))}</h3><p>${esc(uid)} · ${esc(a?.tier || "—")}</p></div><div class="testing-ops-actions"><a href="${panelUrl(uid)}">Athlete Test</a><a href="${setup}">Test Session</a><a href="${sheet}">Coach Sheet</a></div></article>`
        );
      }
    });

    const watched = [];
    const rosterChoices = [];

    athletes.forEach((a, uid) => {
      if (!isCurrentRosterAthlete(a)) return;

      const state =
        clean(
          a?.testing?.state
        ).toUpperCase();

      const inRealTesting =
        [
          "TEMPLE",
          "ELIGIBLE",
          "READY",
          "TESTING",
          "FREEZE",
          "COOLDOWN"
        ].includes(state);

      if (
        a?.testing?.coachWatch === true &&
        !inRealTesting
      ) {
        watched.push({
          uid,
          athlete: a
        });
        return;
      }

      if (
        !inRealTesting &&
        a?.testing?.coachWatch !== true
      ) {
        rosterChoices.push({
          uid,
          athlete: a
        });
      }
    });

    watched.sort((a, b) =>
      nameOf(a.athlete, a.uid).localeCompare(
        nameOf(b.athlete, b.uid)
      )
    );

    rosterChoices.sort((a, b) =>
      nameOf(a.athlete, a.uid).localeCompare(
        nameOf(b.athlete, b.uid)
      )
    );

    if (countWatchEl) {
      countWatchEl.textContent =
        String(watched.length);
    }

    if (watchListEl) {
      render(
        watchListEl,
        watched.map(({uid, athlete}) =>
          athleteWatchCard(uid, athlete)
        ),
        "No athletes are on the Coach testing watchlist."
      );
    }

    if (rosterSelectEl) {
      rosterSelectEl.innerHTML =
        '<option value="">Choose roster athlete</option>' +
        rosterChoices.map(({uid, athlete}) =>
          `<option value="${esc(uid)}">${esc(nameOf(athlete, uid))} · ${esc(athlete?.rankName || athlete?.tier || "—")}</option>`
        ).join("");
    }

    if (watchStatusEl) {
      watchStatusEl.textContent =
        watched.length >= 10
          ? "Watchlist is full (10 athletes). Return an athlete to the roster before adding another."
          : `${watched.length} of 10 watchlist spots used.`;
    }

    if (addWatchBtn) {
      addWatchBtn.disabled =
        watched.length >= 10;
    }

    const readiness = [];

    readinessByUid.forEach(
      (stage, uid) => {
        const a =
          athletes.get(uid) || {};

        const label =
          stage === "TEMPLE"
            ? "Temple · Readiness Building"
            : "Ready for Test";

        readiness.push(
          `<article class="testing-ops-card"><div><span class="testing-ops-stage">${esc(label)}</span><h3>${esc(nameOf(a, uid))}</h3><p>${esc(uid)} · ${esc(a?.rankName || a?.tier || "—")} · ${Number(a?.xp || 0)} XP</p></div><div class="testing-ops-actions"><a href="${panelUrl(uid)}">Review Readiness</a></div></article>`
        );
      }
    );

    render(
      readinessEl,
      readiness,
      "No athletes are currently in Temple or waiting for a testing decision."
    );

    render(
      scheduledEl,
      scheduled,
      "No tests are currently scheduled."
    );

    render(
      activeEl,
      active,
      "No active tests are currently in progress."
    );

    const total =
      watched.length +
      readiness.length +
      scheduled.length +
      active.length;

    if (countTotalEl) {
      countTotalEl.textContent =
        String(total);
    }

    if (countReadinessEl) {
      countReadinessEl.textContent =
        String(readiness.length);
    }

    if (countScheduledEl) {
      countScheduledEl.textContent =
        String(scheduled.length);
    }

    if (countActiveEl) {
      countActiveEl.textContent =
        String(active.length);
    }

    status.textContent =
      total
        ? `${total} athlete${total===1?"":"s"} currently need testing attention.`
        : "Testing pipeline is clear.";

    addWatchBtn?.addEventListener(
      "click",
      async () => {
        const uid =
          clean(
            rosterSelectEl?.value
          );

        if (!uid) {
          if (watchStatusEl) {
            watchStatusEl.textContent =
              "Choose an athlete from the roster first.";
          }
          return;
        }

        if (watched.length >= 10) {
          if (watchStatusEl) {
            watchStatusEl.textContent =
              "Watchlist is limited to 10 athletes.";
          }
          return;
        }

        await updateDoc(
          doc(db, "athletes", uid),
          {
            "testing.coachWatch": true,
            "testing.coachWatchAt":
              serverTimestamp(),
            "testing.coachWatchBy":
              coach?.user?.uid || null,
            updatedAt:
              serverTimestamp()
          }
        );

        window.location.reload();
      }
    );

    watchListEl?.addEventListener(
      "click",
      async (event) => {
        const button =
          event.target.closest(
            "[data-watch-remove]"
          );

        if (!button) return;

        const uid =
          clean(
            button.getAttribute(
              "data-watch-remove"
            )
          );

        if (!uid) return;

        await updateDoc(
          doc(db, "athletes", uid),
          {
            "testing.coachWatch": false,
            "testing.coachWatchAt": null,
            "testing.coachWatchBy": null,
            updatedAt:
              serverTimestamp()
          }
        );

        window.location.reload();
      }
    );
  } catch (error) {
    console.error(
      "[testing-operations]",
      error
    );

    status.textContent =
      error?.message ||
      "Testing pipeline unavailable.";
  }
}

void init();
