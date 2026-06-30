import {
  functions,
  httpsCallable,
  ensureSignedIn,
} from "/assets/js/firebase-init.js";

const $ = (id) => document.getElementById(id);

const DEFAULT_LOCATION_ID = "lompoc";
const DEFAULT_COACH_IDS = ["coach_sandoval"];

const F8_VIRTUES = [
  "FOCUS",
  "EFFORT",
  "ATTITUDE",
  "RESPECT",
  "SPEED",
  "POWER",
  "AGILITY",
  "COMBAT",
];

const F4_VIRTUES = [
  "HONOR",
  "COURAGE",
  "DISCIPLINE",
  "INTEGRITY",
  "PATIENCE",
  "WISDOM",
  "STRENGTH",
  "TENACITY",
];

const VIRTUE_CODE = {
  FOCUS: "FOC",
  EFFORT: "EFF",
  ATTITUDE: "ATT",
  RESPECT: "RSP",
  SPEED: "SPD",
  POWER: "PWR",
  AGILITY: "AGL",
  COMBAT: "CBT",
  HONOR: "HNR",
  COURAGE: "CRG",
  DISCIPLINE: "DSC",
  INTEGRITY: "INT",
  PATIENCE: "PAT",
  WISDOM: "WSD",
  STRENGTH: "ST",
  TENACITY: "TEN",
};

const form = $("newAthleteForm");
const submitBtn = $("submitBtn");
const resultBox = $("resultBox");

function val(id) {
  return String($(id)?.value || "").trim();
}

function num(id) {
  return Number(val(id) || 0);
}

function getVirtueCode(virtueName) {
  const key = String(virtueName || "").trim().toUpperCase();
  return VIRTUE_CODE[key] || key.slice(0, 3) || "NA";
}

function buildPreviewTag(track, virtue) {
  const t = String(track || "").trim().toUpperCase();
  const v = String(virtue || "").trim().toUpperCase();
  if (!t || !v) return "—";
  return `${t}_CB0000_${v}`;
}

function getPlacement(programTrack) {
  const pt = String(programTrack || "").trim();

  if (pt === "zero2hero") {
    return {
      track: "F8",
      program: "wrestling",
      framework: "foundry8",
      programTrack: "zero2hero",
      art: "wrestling",
      ladderKey: "F8",
      rosterIds: ["youth-wrestling"],
      locationId: DEFAULT_LOCATION_ID,
      coachIds: DEFAULT_COACH_IDS,
      trackCode: "foundry8-combat",
      rank: "Shadow",
    };
  }

  if (pt === "road2greatness") {
    return {
      track: "F4",
      program: "boxing",
      framework: "foundry4",
      programTrack: "road2greatness",
      art: "boxing",
      ladderKey: "R2G",
      rosterIds: ["road2greatness-boxing"],
      locationId: DEFAULT_LOCATION_ID,
      coachIds: DEFAULT_COACH_IDS,
      trackCode: "road2greatness-boxing",
      rank: "Apprentice",
    };
  }

  if (pt === "quest2mastery") {
    return {
      track: "F4",
      program: "mma",
      framework: "foundry4",
      programTrack: "quest2mastery",
      art: "mma",
      ladderKey: "Q2M",
      rosterIds: ["adult-mma"],
      locationId: DEFAULT_LOCATION_ID,
      coachIds: DEFAULT_COACH_IDS,
      trackCode: "quest2mastery-mma",
      rank: "Apprentice",
    };
  }

  return {
    track: "F4",
    program: "wrestling",
    framework: "foundry4",
    programTrack: "path2legend",
    art: "wrestling",
    ladderKey: "F4",
    rosterIds: ["teen-wrestling"],
    locationId: DEFAULT_LOCATION_ID,
    coachIds: DEFAULT_COACH_IDS,
    trackCode: "foundry4-combat",
    rank: "Apprentice",
  };
}

function setVirtuesForTrack(track) {
  const sel = $("virtueName");
  if (!sel) return;

  const list = track === "F8" ? F8_VIRTUES : F4_VIRTUES;

  const current = sel.value;

  sel.innerHTML = "";

  list.forEach((v) => {
    const opt = document.createElement("option");
    opt.value = v;
    opt.textContent = v;
    sel.appendChild(opt);
  });

  if (list.includes(current)) {
    sel.value = current;
  }
}

function syncFromProgramTrack() {
  const placement = getPlacement(val("programTrack"));

  $("track").value = placement.track;
  $("program").value = placement.program;

  setVirtuesForTrack(placement.track);
  updatePreview();
}

function updatePreview() {
  const placement = getPlacement(val("programTrack"));
  const track = val("track") || placement.track;
  const virtue = val("virtueName");

  $("p-track").textContent = track || "—";
  $("p-rank").textContent =
    track === "F8" ? "T0_Shadow" : "T0_Apprentice";

  $("p-placement").textContent =
    `${placement.framework} / ${placement.programTrack} / ${placement.art}`;

  $("p-mint-tag").textContent =
    buildPreviewTag(track, virtue);
}

function showResult(html) {
  resultBox.style.display = "block";
  resultBox.innerHTML = html;
}

function hubUrl(uid) {
  return `/athletes/hub/full-hub.html?id=${encodeURIComponent(uid)}`;
}

function profileUrl(uid) {
  return `/athletes/profile/?id=${encodeURIComponent(uid)}`;
}

$("programTrack")?.addEventListener("change", syncFromProgramTrack);
$("track")?.addEventListener("change", () => {
  setVirtuesForTrack(val("track"));
  updatePreview();
});
$("virtueName")?.addEventListener("change", updatePreview);
$("program")?.addEventListener("change", updatePreview);

syncFromProgramTrack();

form.addEventListener("submit", async (e) => {
  e.preventDefault();

  submitBtn.disabled = true;
  submitBtn.textContent = "Creating...";

  try {
    await ensureSignedIn();

    const createCoachAthleteCall =
      httpsCallable(functions, "createCoachAthleteCall");

    const placement = getPlacement(val("programTrack"));
    const track = val("track");
    const virtueName = val("virtueName").toUpperCase();
    const virtueCode = getVirtueCode(virtueName);
    const mintVirtueTag = buildPreviewTag(track, virtueName);
    const experienceYears = num("experienceYears");
    const startingXp = Math.max(0, num("startingXp"));
    const startingXpNote = val("startingXpNote");

    const payload = {
      first: val("first"),
      last: val("last"),
      track,
      program: val("program"),
      team: val("team"),
      grade: val("grade"),
      birthYear: val("birthYear"),
      source: val("source"),
      notes: val("notes"),

      framework: placement.framework,
      programTrack: placement.programTrack,
      art: placement.art,
      ladderKey: placement.ladderKey,
      rosterIds: placement.rosterIds,
      coachIds: placement.coachIds,
      locationId: placement.locationId,

      placement: {
        ...placement,
        source: "coach_direct_intake",
      },

      virtueName,
      virtueCode,
      mintVirtueTag,

      experience: {
        years: experienceYears,
        placementOnly: true,
        grantsXP: false,
        transferXP: false,
        source: "coach_direct",
      },

            lifecycleDefaults: {
        promotionLocked: true,

        legacy: false,
        legacyCreditIssued: 0,
        legacyCreditTotal: 0,
        legacyCreditSchedule: "",
        legacyHold: false,
        legacyNote: "",
        legacyType: "",
        legacyYearsVerified: 0,

        testing: {
          state: "ACTIVE",
          coachReady: false,
          coachReadyAt: null,
          cooldownUntil: null,
          freezeUntil: null,
          lastTestResult: null,
          templeEnteredAt: null,
          testEligibleAt: null,
          testingStartedAt: null,
          tier: "T0",
          track: placement.trackCode,
          trackCode: placement.trackCode
        }
      },

      adjustment: startingXp > 0
        ? {
            amount: startingXp,
            note:
              startingXpNote ||
              "Paper pilot / late onboarding XP",
            kind: "PAPER_RECONCILE_GRIND",
            source: "coach_direct_intake",
          }
        : null,
    };

    const res = await createCoachAthleteCall(payload);

    const athlete = res.data?.athlete || {};
    const uid = athlete.uid;

    showResult(`
      <strong>✓ Athlete created</strong><br><br>

      <div><strong>ID:</strong> ${uid}</div>
      <div><strong>Name:</strong> ${athlete.publicName || ""}</div>
      <div><strong>Track:</strong> ${athlete.track || ""}</div>
      <div><strong>Rank:</strong> ${athlete.rank || ""}</div>
      <div><strong>XP:</strong> ${athlete.xp || 0}</div>
      <div><strong>Placement:</strong> ${athlete.programTrack || ""} / ${athlete.art || ""}</div>
      <div><strong>Mint Tag:</strong> ${athlete.mintVirtueTag || ""}</div>

      <br>

      <div class="actions">
        <a class="btn brand" href="${hubUrl(uid)}">Open Athlete Hub</a>
        <a class="btn" href="${profileUrl(uid)}">Open Profile</a>
        <button class="btn" type="button" id="copyHubBtn">Copy Hub Link</button>
      </div>
    `);

    $("copyHubBtn")?.addEventListener("click", async () => {
      await navigator.clipboard.writeText(
        `${location.origin}${hubUrl(uid)}`
      );
    });

    form.reset();
    $("team").value = "LAW";
    syncFromProgramTrack();

  } catch (err) {
    console.error(err);

    showResult(`
      <strong>⚠ Failed</strong><br>
      ${err?.message || String(err)}
    `);
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = "Create Athlete";
  }
});