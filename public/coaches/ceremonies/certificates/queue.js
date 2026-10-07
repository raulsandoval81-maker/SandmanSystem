import {
  db,
  collection,
  getDocs
} from "/assets/js/firebase-init.js";

import {
  requireCoach
} from "/assets/js/coach-guard.js";

const ENGINE_ENDPOINTS = {
  recognition:
    "https://us-central1-sandmandashboard.cloudfunctions.net/testRecognitionQueue",

  progression:
    "https://us-central1-sandmandashboard.cloudfunctions.net/testProgressionEngine",

  certificatePayload:
    "https://us-central1-sandmandashboard.cloudfunctions.net/testCertificatePayloadEngine"
};

const $ = (id) =>
  document.getElementById(id);

const queueStatus =
  $("queueStatus");

const recognitionQueue =
  $("recognitionQueue");

const approachingQueue =
  $("approachingQueue");

const countRecognitionTotal =
  $("countRecognitionTotal");

const countApproaching =
  $("countApproaching");

const countReady =
  $("countReady");

const athleteUid =
  $("athleteUid");

const checkBtn =
  $("checkBtn");

const manualStatus =
  $("manualStatus");

function clean(value) {
  return String(value ?? "").trim();
}

function esc(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function displayName(data, uid) {
  return (
    clean(
      data?.publicName ||
      data?.fullName ||
      data?.name
    ) ||
    uid
  );
}

function stripeCount(data) {
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

function tierXp(data) {
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

function xpCap(data) {
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
    clean(
      data?.rosterStatus ||
      data?.status
    ).toLowerCase();

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

async function authFetchJson(url, user) {
  const token =
    await user.getIdToken();

  const response =
    await fetch(url, {
      headers: {
        Authorization:
          `Bearer ${token}`
      }
    });

  if (!response.ok) {
    throw new Error(
      `Request failed: ${response.status}`
    );
  }

  const data =
    await response.json();

  return data;
}

function generatorUrl(uid) {
  return (
    "/coaches/ceremonies/certificates/generator.html?uid=" +
    encodeURIComponent(uid)
  );
}

function renderApproaching(items) {
  if (!approachingQueue) return;

  if (!items.length) {
    approachingQueue.innerHTML = `
      <div class="empty-state">
        <h3>No athletes approaching</h3>
        <p>No one is currently within 50 XP of the next stripe threshold.</p>
      </div>
    `;
    return;
  }

  approachingQueue.innerHTML =
    items.map((item) => `
      <article class="recognition-card recognition-card--approaching">
        <div class="recognition-card__main">
          <span class="recognition-state">Approaching</span>
          <h3>${esc(item.athleteName)}</h3>
          <p class="recognition-meta">
            ${esc(item.athleteUid)} · Stripe ${esc(item.stripe)}
          </p>
          <p class="recognition-detail">
            ${esc(item.remaining)} XP remaining before the stripe recognition point.
          </p>
        </div>
        <div class="recognition-card__action">
          <span class="watch-label">Monitor</span>
        </div>
      </article>
    `).join("");
}

function renderQueue(items) {
  if (!recognitionQueue) return;

  if (!items.length) {
    recognitionQueue.innerHTML = `
      <div class="empty-state">
        <h3>No certificates ready</h3>
        <p>No athlete has reached a certificate-ready recognition point.</p>
      </div>
    `;
    return;
  }

  recognitionQueue.innerHTML =
    items.map((item) => `
      <article class="recognition-card recognition-card--ready">
        <div class="recognition-card__main">
          <span class="recognition-state">Certificate Ready</span>
          <h3>${esc(item.athleteName)}</h3>
          <p class="recognition-meta">
            ${esc(item.athleteUid)} · Stripe ${esc(item.stripe)}
          </p>
          <p class="recognition-detail">
            Stripe earned. Open the generator to review the certificate details and continue the recognition workflow.
          </p>
        </div>
        <div class="recognition-card__action">
          <a
            class="primary-action"
            href="${generatorUrl(item.athleteUid)}"
          >
            Open Generator
          </a>
        </div>
      </article>
    `).join("");
}

async function loadQueue() {
  try {
    const coachContext =
      await requireCoach();

    const user =
      coachContext?.user;

    if (!user) {
      throw new Error(
        "Coach sign-in required."
      );
    }

    const athleteSnapshot =
      await getDocs(
        collection(db, "athletes")
      );

    let recognitionData = null;

    try {
      const data =
        await authFetchJson(
          ENGINE_ENDPOINTS.recognition,
          user
        );

      if (data?.ok) {
        recognitionData = data;
      }
    } catch (error) {
      console.warn(
        "[certificate-queue] certificate-ready service unavailable; showing watch queue only",
        error
      );
    }

    const readyItems =
      Array.isArray(
        recognitionData?.queue?.stripeAwards
      )
        ? recognitionData.queue.stripeAwards
        : [];

    const readyIds =
      new Set(
        readyItems
          .map((item) =>
            clean(item?.athleteUid)
          )
          .filter(Boolean)
      );

    const ready =
      readyItems.map((item) => ({
        status: "ready",
        athleteUid:
          clean(item?.athleteUid),
        athleteName:
          clean(
            item?.athleteName ||
            item?.athleteUid
          ) || "Athlete",
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
      const uid =
        docSnap.id;

      if (readyIds.has(uid)) {
        return;
      }

      const athlete =
        docSnap.data() || {};

      if (!isCurrentAthlete(athlete)) {
        return;
      }

      const cap =
        xpCap(athlete);

      if (cap <= 0) {
        return;
      }

      const currentStripe =
        stripeCount(athlete);

      if (currentStripe >= 4) {
        return;
      }

      const nextStripe =
        currentStripe + 1;

      const threshold =
        Math.ceil(
          (cap * nextStripe) / 4
        );

      const remaining =
        threshold - tierXp(athlete);

      if (
        remaining <= 0 ||
        remaining > 50
      ) {
        return;
      }

      approaching.push({
        status: "approaching",
        athleteUid: uid,
        athleteName:
          displayName(
            athlete,
            uid
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

    ready.sort(
      (a, b) =>
        a.athleteName.localeCompare(
          b.athleteName
        )
    );

    if (countApproaching) {
      countApproaching.textContent =
        String(approaching.length);
    }

    if (countReady) {
      countReady.textContent =
        String(ready.length);
    }

    if (countRecognitionTotal) {
      countRecognitionTotal.textContent =
        String(ready.length + approaching.length);
    }

    renderApproaching(approaching);
    renderQueue(ready);

    if (queueStatus) {
      const total =
        ready.length +
        approaching.length;

      queueStatus.textContent =
        recognitionData
          ? (
              total
                ? `${approaching.length} approaching · ${ready.length} certificate${ready.length === 1 ? "" : "s"} ready.`
                : "Recognition queue is clear."
            )
          : `${approaching.length} approaching · certificate-ready check unavailable.`;
    }
  } catch (error) {
    console.error(
      "[certificate-queue] load failed:",
      error
    );

    if (queueStatus) {
      queueStatus.textContent =
        error?.message ||
        "Recognition queue unavailable.";
    }

    if (recognitionQueue) {
      recognitionQueue.innerHTML =
        '<div class="empty-state"><h3>Queue unavailable</h3><p>Unable to load recognition tracking.</p></div>';
    }
  }
}

async function checkAthlete() {
  const uid =
    clean(athleteUid?.value);

  if (!uid) {
    if (manualStatus) {
      manualStatus.innerHTML =
        "<p>Enter an athlete UID.</p>";
    }
    return;
  }

  if (manualStatus) {
    manualStatus.innerHTML =
      `<p>Checking ${esc(uid)}…</p>`;
  }

  try {
    const coachContext =
      await requireCoach();

    const user =
      coachContext?.user;

    if (!user) {
      throw new Error(
        "Coach sign-in required."
      );
    }

    const [
      progressionData,
      payloadData
    ] = await Promise.all([
      authFetchJson(
        `${ENGINE_ENDPOINTS.progression}?uid=${encodeURIComponent(uid)}`,
        user
      ),
      authFetchJson(
        `${ENGINE_ENDPOINTS.certificatePayload}?uid=${encodeURIComponent(uid)}`,
        user
      )
    ]);

    if (!progressionData?.success) {
      throw new Error(
        progressionData?.error ||
        "Progression lookup failed."
      );
    }

    if (!payloadData?.success) {
      throw new Error(
        payloadData?.error ||
        "Certificate lookup failed."
      );
    }

    const athlete =
      progressionData.athlete || {};

    const decision =
      progressionData.decision || {};

    const payload =
      payloadData.payload || {};

    const printReady =
      payload?.printReady === true;

    if (manualStatus) {
      manualStatus.innerHTML = `
        <article class="manual-result">
          <h3>${esc(athlete.name || uid)}</h3>

          <p>
            <strong>Progression:</strong>
            ${esc(decision.state || "Unknown")}
          </p>

          <p>
            <strong>Next Action:</strong>
            ${esc(decision.nextAction || "Continue training")}
          </p>

          <p>
            <strong>Certificate:</strong>
            ${
              printReady
                ? "Ready"
                : payload?.reason === "LEGACY_PLACEMENT"
                  ? "Legacy placement recognized — no Sandman certificate"
                  : "Not ready"
            }
          </p>

          ${
            printReady
              ? `
                <a
                  class="primary-action"
                  href="${generatorUrl(uid)}"
                >
                  Generate Certificate
                </a>
              `
              : ""
          }
        </article>
      `;
    }
  } catch (error) {
    console.error(
      "[certificate-queue] manual check failed:",
      error
    );

    if (manualStatus) {
      manualStatus.innerHTML = `
        <div class="error-state">
          <strong>Error:</strong>
          ${esc(
            error?.message ||
            "Unable to check athlete."
          )}
        </div>
      `;
    }
  }
}

if (checkBtn) {
  checkBtn.addEventListener(
    "click",
    checkAthlete
  );
}

if (athleteUid) {
  athleteUid.addEventListener(
    "keydown",
    (event) => {
      if (event.key === "Enter") {
        checkAthlete();
      }
    }
  );
}

void loadQueue();
