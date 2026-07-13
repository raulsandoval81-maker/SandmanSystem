import {
  db,
  ensureSignedIn,
  collection,
  doc,
  getDoc,
  getDocs, 
  setDoc,
  query,
  where,
  orderBy,
  serverTimestamp,
  limit,
  onSnapshot,
} from "/assets/js/firebase-init.js";

const $ = (id) => document.getElementById(id);

const intakeParams =
  new URLSearchParams(window.location.search);

const intakeModeRaw =
  String(intakeParams.get("mode") || "new_athlete")
    .trim()
    .toLowerCase();

const intakeMode =
  intakeModeRaw === "add_sport"
    ? "add_sport"
    : "new_athlete";

const existingAthleteUid =
  String(
    intakeParams.get("athleteUid") ||
    intakeParams.get("existingAthleteUid") ||
    ""
  )
    .trim()
    .toUpperCase();

const requestedTrack =
  String(
    intakeParams.get("track") ||
    intakeParams.get("trackCode") ||
    ""
  )
    .trim()
    .toLowerCase();

const requestedLane =
  String(
    intakeParams.get("lane") ||
    intakeParams.get("art") ||
    intakeParams.get("discipline") ||
    ""
  )
    .trim()
    .toLowerCase();

function esc(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function inviteUrlForToken(tokenId) {
  return `${location.origin}/intake-parent/?invite=${encodeURIComponent(tokenId)}`;
}

async function loadExistingAthleteForAddSport() {
  if (intakeMode !== "add_sport") return null;

  if (
    !existingAthleteUid ||
    !requestedTrack ||
    !requestedLane
  ) {
    throw new Error(
      "Add-sport intake requires athlete UID, track, and lane."
    );
  }

  const athleteRef =
    doc(db, "athletes", existingAthleteUid);

  const athleteSnap =
    await getDoc(athleteRef);

  if (!athleteSnap.exists()) {
    throw new Error(
      `Existing athlete not found: ${existingAthleteUid}`
    );
  }

  const athlete =
    athleteSnap.data() || {};

  return {
    uid: athleteSnap.id,
    name:
      athlete.publicName ||
      athlete.fullName ||
      athlete.name ||
      athleteSnap.id,
    athlete
  };
}

function reviewUrlForIntake(intakeId) {
  return `/intake-coach/review.html?token=${encodeURIComponent(intakeId)}`;
}

function formatNameFromIntake(d = {}) {
  return (
    `${d.athlete?.first ?? ""} ${d.athlete?.last ?? ""}`.trim() ||
    `${d.first ?? ""} ${d.last ?? ""}`.trim() ||
    d.fullName ||
    "(no name)"
  );
}

function formatCityState(city, state) {
  const c = String(city || "").trim();
  const s = String(state || "").trim();

  if (c && s) return `${c}, ${s}`;
  if (c) return c;
  if (s) return s;
  return "—";
}

function renderPendingCard({ intakeId, name, city, state }) {
  return `
    <div class="pending-card">
      <div class="pending-card-head">
        <div>
          <div class="pending-card-name">${esc(name)}</div>
          <div class="pending-card-meta">${esc(formatCityState(city, state))}</div>
          <div class="pending-card-id">(${esc(intakeId.slice(-6))})</div>
        </div>
      </div>

      <div class="pending-card-actions">
        <button class="small solid-blue" data-intake="${esc(intakeId)}">Review →</button>
      </div>
    </div>
  `;
}

function renderApprovedCard({ uid, name, city, state, parentEmail }) {
  return `
    <div class="pending-card">
      <div class="pending-card-head">
        <div>
          <div class="pending-card-name">${esc(name)}</div>
          <div class="pending-card-meta">${esc(formatCityState(city, state))}</div>
          <div class="pending-card-id">${esc(uid)}</div>
          ${
            parentEmail
              ? `<div class="pending-card-meta small">${esc(parentEmail)}</div>`
              : ""
          }
        </div>
      </div>

      <div class="pending-card-actions">
        <button class="small outline-blue" data-approved-uid="${esc(uid)}">Open Onboarding</button>
        <button class="small outline-blue" data-parent-uid="${esc(uid)}">Parent Link</button>
      </div>
    </div>
  `;
}

// ------------------------------------------------------
// 1) Generate Token (48 hours)
//   Writes to: intakeTokens/{token}
// ------------------------------------------------------
$("btn-make-token")?.addEventListener("click", async () => {
  try {
    const newTokenId = crypto.randomUUID().replace(/-/g, "").slice(0, 16);
    const exp = Date.now() + 48 * 60 * 60 * 1000;

    const existingAthlete =
      await loadExistingAthleteForAddSport();

    await setDoc(doc(db, "intakeTokens", newTokenId), {
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      exp,
      used: false,
      status: "invited",
      mode:
        intakeMode === "add_sport"
          ? "add_sport"
          : "new_athlete",

      existingAthleteUid:
        intakeMode === "add_sport"
          ? existingAthleteUid
          : "",

      forTrack:
        intakeMode === "add_sport"
          ? requestedTrack
          : null,

      forLane:
        intakeMode === "add_sport"
          ? requestedLane
          : null,

      requestedTrackCode:
        intakeMode === "add_sport"
          ? requestedTrack
          : null,

      requestedDiscipline:
        intakeMode === "add_sport"
          ? requestedLane
          : null,

      existingAthleteName:
        existingAthlete?.name || null,

      source: "coach_intake",
      workflowVersion: "add-sport-v1",
    });

    const inviteUrl = inviteUrlForToken(newTokenId);

    if ($("invite-link")) $("invite-link").value = inviteUrl;
    if ($("invite-status")) {
      $("invite-status").textContent =
        intakeMode === "add_sport"
          ? `✓ Add-sport invite created for ${existingAthlete?.name || existingAthleteUid}.`
          : "✓ New-athlete invite created (48h).";
    }
  } catch (err) {
    console.error(err);
    if ($("invite-status")) {
      $("invite-status").textContent =
        `⚠ ${err?.message || "Error creating token."}`;
    }
  }
});

// ------------------------------------------------------
// 2) Copy Link
// ------------------------------------------------------
$("btn-copy-token")?.addEventListener("click", async () => {
  try {
    const url = $("invite-link")?.value;
    if (!url) return;

    await navigator.clipboard.writeText(url);

    if ($("invite-status")) {
      $("invite-status").textContent = "✓ Copied to clipboard.";
    }
  } catch (err) {
    console.error(err);
    if ($("invite-status")) {
      $("invite-status").textContent = "⚠ Copy failed.";
    }
  }
});

// ------------------------------------------------------
// 3) Open Parent Intake
// ------------------------------------------------------
$("btn-open-qr")?.addEventListener("click", () => {
  const url = $("invite-link")?.value;
  if (!url) return;
  window.open(url, "_blank", "noopener");
});

// ------------------------------------------------------
// 4) Load Pending Intakes (Live)
//   Reads from: intakes (submitted)
//   Pending = approvedUid is null (not minted yet)
// ------------------------------------------------------
let unsubPending = null;

function wirePendingButtons() {
  document.querySelectorAll("[data-intake]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const intakeId = btn.dataset.intake;
      if (!intakeId) return;
      location.href = reviewUrlForIntake(intakeId);
    });
  });
}

function loadPendingLive() {
  const box = $("pending-list");
  if (!box) return;

  if (typeof unsubPending === "function") unsubPending();

  const qy = query(
    collection(db, "intakes"),
    where("approvedUid", "==", null),
    orderBy("createdAt", "desc"),
    limit(25)
  );

  unsubPending = onSnapshot(
    qy,
    (snaps) => {
      let html = "";
      let count = 0;

      snaps.forEach((snap) => {
        const d = snap.data() || {};
        const intakeId = snap.id;

        count += 1;

        html += renderPendingCard({
          intakeId,
          name: formatNameFromIntake(d),
          city: d.location?.city ?? "",
          state: d.location?.state ?? "",
        });
      });

      if ($("pending-count")) {
        $("pending-count").textContent = `${count} pending`;
      }

      box.innerHTML = html
        ? `<div class="pending-list">${html}</div>`
        : "<div class='muted small'>No pending intakes.</div>";

      wirePendingButtons();
    },
    (err) => {
      console.error(err);
      box.innerHTML = "<div class='muted small'>Error loading pending intakes.</div>";
    }
  );
}

$("btn-find-intakes")?.addEventListener("click", loadPendingLive);

// ------------------------------------------------------
// 5) Load Recently Approved Athletes
// ------------------------------------------------------
function wireApprovedButtons() {
  document.querySelectorAll("[data-approved-uid]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const uid = btn.dataset.approvedUid;
      if (!uid) return;

      const onboardingUrl = `${location.origin}/athlete-onboarding/?id=${encodeURIComponent(uid)}`;
      window.open(onboardingUrl, "_blank", "noopener");
    });
  });

  document.querySelectorAll("[data-parent-uid]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const uid = btn.dataset.parentUid;
      if (!uid) return;

const parentUrl = `${location.origin}/parent/index.html?uid=${encodeURIComponent(uid)}`;
      window.open(parentUrl, "_blank", "noopener");
    });
  });
}

async function loadApproved() {
  const box = $("approved-list");
  if (!box) return;

  try {
    const qy = query(
      collection(db, "athletes"),
      orderBy("createdAt", "desc"),
      limit(7)
    );

    const snaps = await getDocs(qy);

    let html = "";

    snaps.forEach((snap) => {
      const a = snap.data() || {};
      const uid = a.uid || snap.id;
      const name = a.publicName || a.fullName || uid;

      html += renderApprovedCard({
        uid,
        name,
        city: a.city || "",
        state: a.state || "",
        parentEmail: a.parentEmail || "",
      });
    });

    box.innerHTML = html
      ? `<div class="pending-list">${html}</div>`
      : "<div class='muted small'>No recent approvals.</div>";

    wireApprovedButtons();
  } catch (err) {
    console.error(err);
    box.innerHTML = "<div class='muted small'>Error loading approvals.</div>";
  }
}


// ------------------------------------------------------
// Add Discipline workflow
// Existing athlete + new combat discipline
// ------------------------------------------------------
function normalizeAthleteUid(value = "") {
  return String(value || "")
    .trim()
    .toUpperCase();
}

$("btn-start-add-discipline")?.addEventListener("click", () => {
  const athleteUid =
    normalizeAthleteUid(
      $("add-discipline-athlete-uid")?.value
    );

  const disciplineSelect =
    $("add-discipline-track");

  const selectedOption =
    disciplineSelect?.selectedOptions?.[0];

  const track =
    String(
      selectedOption?.dataset?.track ||
      disciplineSelect?.value ||
      ""
    )
      .trim()
      .toLowerCase();

  const lane =
    String(
      selectedOption?.dataset?.lane ||
      ""
    )
      .trim()
      .toLowerCase();

  const status =
    $("add-discipline-status");

  if (!athleteUid) {
    if (status) {
      status.textContent =
        "⚠ Enter the existing athlete UID.";
    }

    $("add-discipline-athlete-uid")?.focus();
    return;
  }

  if (!/^F[48]_[A-Z0-9_]+$/i.test(athleteUid)) {
    if (status) {
      status.textContent =
        "⚠ Enter a valid Sandman athlete UID.";
    }

    $("add-discipline-athlete-uid")?.focus();
    return;
  }

  if (!track || !lane) {
    if (status) {
      status.textContent =
        "⚠ Choose the new discipline.";
    }

    disciplineSelect?.focus();
    return;
  }

  const url =
    new URL(
      "/intake-coach/",
      window.location.origin
    );

  url.searchParams.set(
    "mode",
    "add_sport"
  );

  url.searchParams.set(
    "athleteUid",
    athleteUid
  );

  url.searchParams.set(
    "track",
    track
  );

  url.searchParams.set(
    "lane",
    lane
  );

  window.location.href =
    url.pathname + url.search;
});

// ------------------------------------------------------
// Boot: sign in first, THEN query/list
// ------------------------------------------------------
(async () => {
  try {
    if (typeof ensureSignedIn === "function") {
      await ensureSignedIn();
    }
  } catch (err) {
    console.error("ensureSignedIn failed:", err);
  }

  loadPendingLive();
  loadApproved();
})();