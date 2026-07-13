import {
  functions,
  httpsCallable,
  ensureSignedIn,
} from "/assets/js/firebase-init.js";

const $ = (id) => document.getElementById(id);

const DEFAULT_LOCATION_ID = "lompoc";
const DEFAULT_COACH_IDS = ["coach_sandoval"];

function selectedLocationId() {
  const location =
    String($("locationId")?.value || "").trim().toLowerCase();

  return location === "solvang"
    ? "solvang"
    : DEFAULT_LOCATION_ID;
}

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

const NEW_ATHLETE_ONLY_IDS = [
  "first",
  "last",
  "team",
  "grade",
  "dob",
  "city",
  "state",
  "parentName",
  "parentEmail",
  "parentPhone",
  "emergencyName",
  "emergencyPhone",
  "medical",
  "waiverSignedBy",
  "waiverSignatureDate",
  "virtueName",
  "experienceYears",
  "startingXp",
  "startingXpNote",
  "notes",
];

function getWorkflowMode() {
  return String(
    $("workflowMode")?.value ||
    "new_athlete"
  )
    .trim()
    .toLowerCase();
}

function isAddDisciplineMode() {
  return getWorkflowMode() === "add_sport";
}

function setWorkflowMode(mode) {
  const safeMode =
    mode === "add_sport"
      ? "add_sport"
      : "new_athlete";

  if ($("workflowMode")) {
    $("workflowMode").value =
      safeMode;
  }

  applyWorkflowModeUI();
}

function setFieldMode(id, hidden) {
  const el = $(id);
  if (!el) return;

  const wrap = el.closest("label");
  if (wrap) {
    wrap.hidden = hidden;
  }

  if (hidden) {
    el.dataset.wasRequired =
      el.required ? "true" : "false";

    el.required = false;
    el.disabled = true;
  } else {
    el.disabled = false;

    if (el.dataset.wasRequired === "true") {
      el.required = true;
    }
  }
}

function applyWorkflowModeUI() {
  const addSport =
    isAddDisciplineMode();

  const newButton =
    $("workflowNewAthleteBtn");

  const addButton =
    $("workflowAddSportBtn");

  newButton?.classList.toggle(
    "is-active",
    !addSport
  );

  addButton?.classList.toggle(
    "is-active",
    addSport
  );

  newButton?.setAttribute(
    "aria-pressed",
    String(!addSport)
  );

  addButton?.setAttribute(
    "aria-pressed",
    String(addSport)
  );

  if ($("workflowHeading")) {
    $("workflowHeading").textContent =
      addSport
        ? "Add Discipline to Existing Athlete"
        : "Create New Athlete";
  }

  if ($("workflowDescription")) {
    $("workflowDescription").textContent =
      addSport
        ? "Keep the athlete’s current UID and add another Combat progression path."
        : "Create a new Sandman identity and assign the athlete’s first Combat discipline.";
  }

  if ($("existingAthleteUidField")) {
    $("existingAthleteUidField").hidden =
      !addSport;
  }

  if ($("existingAthleteUid")) {
    $("existingAthleteUid").required =
      addSport;

    $("existingAthleteUid").disabled =
      !addSport;
  }

  if ($("addDisciplineNotice")) {
    $("addDisciplineNotice").hidden =
      !addSport;
  }

  NEW_ATHLETE_ONLY_IDS.forEach((id) => {
    setFieldMode(id, addSport);
  });

  if ($("programTrackLabel")) {
    $("programTrackLabel").textContent =
      addSport
        ? "Discipline to Add"
        : "Journey and Art";
  }

  if ($("previewEyebrow")) {
    $("previewEyebrow").textContent =
      addSport
        ? "Discipline Preview"
        : "Mint Preview";
  }

  if ($("submitBtnLabel")) {
    $("submitBtnLabel").textContent =
      addSport
        ? "Verify & Add Discipline"
        : "Verify Paper Intake & Create Athlete";
  }

  updatePreview();
}

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

  if (pt === "zero2hero-kickboxing") {
    return {
      track: "F8",
      program: "kickboxing",
      framework: "foundry8",
      journey: "zero2hero",
      programTrack: "zero2hero",
      art: "kickboxing",
      discipline: "kickboxing",
      primaryDiscipline: "kickboxing",
      ladderKey: "F8",
      rosterIds: ["youth-kickboxing"],
      locationId: selectedLocationId(),
      coachIds: DEFAULT_COACH_IDS,
      trackCode: "zero2hero-kickboxing",
      profileType: "youth",
      beltSet: "f8-youth",
      badgeSet: "f8-youth",
      rank: "Shadow",
    };
  }

  if (pt === "zero2hero") {
    return {
      track: "F8",
      program: "wrestling",
      framework: "foundry8",
      journey: "zero2hero",
      programTrack: "zero2hero",
      art: "wrestling",
      discipline: "wrestling",
      primaryDiscipline: "wrestling",
      ladderKey: "F8",
      rosterIds: ["youth-wrestling"],
      locationId: selectedLocationId(),
      coachIds: DEFAULT_COACH_IDS,
      trackCode: "zero2hero-wrestling",
      profileType: "youth",
      beltSet: "f8-youth",
      badgeSet: "f8-youth",
      rank: "Shadow",
    };
  }

  if (pt === "path2legend-boxing") {
    return {
      track: "path2legend",
      program: "boxing",
      framework: "foundry4",
      journey: "path2legend",
      programTrack: "path2legend",
      art: "boxing",
      discipline: "boxing",
      primaryDiscipline: "boxing",
      ladderKey: "F4",
      rosterIds: ["teen-adult-boxing"],
      locationId: selectedLocationId(),
      coachIds: DEFAULT_COACH_IDS,
      trackCode: "path2legend-boxing",
      profileType: "teen",
      beltSet: "teen",
      badgeSet: "teen",
      rank: "Apprentice",
    };
  }

  if (pt === "quest2mastery") {
    return {
      track: "quest2mastery",
      program: "mma",
      framework: "foundry4",
      journey: "quest2mastery",
      programTrack: "quest2mastery",
      art: "mma",
      discipline: "mma",
      primaryDiscipline: "mma",
      ladderKey: "Q2M",
      rosterIds: ["adult-mma"],
      locationId: selectedLocationId(),
      coachIds: DEFAULT_COACH_IDS,
      trackCode: "quest2mastery-mma",
      profileType: "adult",
      beltSet: "f4-adult",
      badgeSet: "f4-adult",
      rank: "Apprentice",
    };
  }

  return {
    program: "wrestling",
    framework: "foundry4",
    journey: "path2legend",
    programTrack: "path2legend",
    art: "wrestling",
    discipline: "wrestling",
    primaryDiscipline: "wrestling",
    ladderKey: "F4",
    rosterIds: ["teen-wrestling"],
    locationId: selectedLocationId(),
    coachIds: DEFAULT_COACH_IDS,
    track:  "path2legend",
    trackCode: "path2legend-wrestling",
    profileType: "teen",
    beltSet: "teen",
    badgeSet: "teen",
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

$("workflowNewAthleteBtn")?.addEventListener(
  "click",
  () => setWorkflowMode("new_athlete")
);

$("workflowAddSportBtn")?.addEventListener(
  "click",
  () => setWorkflowMode("add_sport")
);

$("workflowMode")?.addEventListener(
  "change",
  applyWorkflowModeUI
);

$("programTrack")?.addEventListener("change", syncFromProgramTrack);
$("track")?.addEventListener("change", () => {
  setVirtuesForTrack(val("track"));
  updatePreview();
});
$("virtueName")?.addEventListener("change", updatePreview);
$("program")?.addEventListener("change", updatePreview);

syncFromProgramTrack();
applyWorkflowModeUI();

function birthYearFromDob(dob = "") {
  const match = String(dob || "").match(/^(\d{4})-\d{2}-\d{2}$/);
  return match ? match[1] : "";
}

function normalizePhone(value = "") {
  return String(value || "").replace(/\D/g, "").slice(0, 10);
}

function publicNameFromParts(first = "", last = "") {
  const initial = String(first || "").trim().charAt(0).toUpperCase();
  const cleanLast = String(last || "").trim();

  return initial && cleanLast
    ? `${initial}. ${cleanLast}`
    : `${first} ${last}`.trim();
}

async function addDisciplineFromPaperForm(
  placement
) {
  const existingAthleteUid =
    String(
      $("existingAthleteUid")?.value ||
      ""
    )
      .trim()
      .toUpperCase();

  if (!existingAthleteUid) {
    throw new Error(
      "Existing athlete UID is required."
    );
  }

  const addDisciplineCoachCall =
    httpsCallable(
      functions,
      "addDisciplineCoachCall"
    );

  const response =
    await addDisciplineCoachCall({
      existingAthleteUid,

      foundry:
        placement.framework === "foundry8"
          ? "f8"
          : "f4",

      framework:
        placement.framework,

      programTrack:
        placement.programTrack,

      art:
        placement.art,

      discipline:
        placement.discipline,

      trackCode:
        placement.trackCode,

      ladderKey:
        placement.ladderKey,

      rosterIds:
        placement.rosterIds,

      coachIds:
        placement.coachIds,

      locationId:
        placement.locationId,

      placement: {
        ...placement,
        source: "coach_paper_add_sport",
      },
    });

  return {
    existingAthleteUid,
    result:
      response?.data || {},
  };
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();

  submitBtn.disabled = true;

  if ($("submitBtnLabel")) {
    $("submitBtnLabel").textContent =
      isAddDisciplineMode()
        ? "Adding Discipline..."
        : "Creating Athlete...";
  }

  try {
    await ensureSignedIn();

    const createCoachAthleteCall =
      httpsCallable(functions, "createCoachAthleteCall");

    const placement = getPlacement(val("programTrack"));

    if (isAddDisciplineMode()) {
      const added =
        await addDisciplineFromPaperForm(
          placement
        );

      const uid =
        added.existingAthleteUid;

      showResult(`
        <strong>✓ Discipline added</strong><br><br>

        <div><strong>ID:</strong> ${uid}</div>
        <div><strong>Athlete:</strong> ${uid}</div>

        <div>
          <strong>New Discipline:</strong>
          ${placement.art}
        </div>

        <div>
          <strong>Journey:</strong>
          ${placement.programTrack}
        </div>

        <div>
          <strong>Starting Rank:</strong>
          ${
            placement.framework === "foundry8"
              ? "Shadow"
              : "Apprentice"
          }
        </div>

        <div>
          <strong>Starting XP:</strong>
          0 / ${
            placement.framework === "foundry8"
              ? 600
              : 1000
          }
        </div>

        <br>

        <div class="actions">
          <a
            class="btn brand"
            href="${hubUrl(uid)}"
          >
            Open Athlete Hub
          </a>

          <a
            class="btn"
            href="${profileUrl(uid)}"
          >
            Open Profile
          </a>
        </div>
      `);

      $("existingAthleteUid").value = "";
      return;
    }

    // Placement is the source of truth.
    const track = placement.track;
    const program = placement.program;

    const first = val("first");
    const last = val("last");
    const dob = val("dob");
    const birthYear =
      birthYearFromDob(dob) || val("birthYear");

    const virtueName = val("virtueName").toUpperCase();
    const virtueCode = getVirtueCode(virtueName);
    const mintVirtueTag = buildPreviewTag(track, virtueName);

    const experienceYears = num("experienceYears");
    const startingXp = Math.max(0, num("startingXp"));
    const startingXpNote = val("startingXpNote");

    const parentName = val("parentName");
    const parentEmail = val("parentEmail").toLowerCase();
    const parentPhoneDigits =
      normalizePhone(val("parentPhone"));

    const emergencyName = val("emergencyName");
    const emergencyPhoneDigits =
      normalizePhone(val("emergencyPhone"));

    const city = val("city");
    const state = val("state").toUpperCase().slice(0, 2);
    const medical = val("medical") || "None";

    const waiverSignedBy = val("waiverSignedBy");
    const waiverSignatureDate = val("waiverSignatureDate");

    if (!first || !last) {
      throw new Error("Athlete first and last name are required.");
    }

    if (!dob && !birthYear) {
      throw new Error("Date of birth or birth year is required.");
    }

    if (!parentName || !parentEmail || !parentPhoneDigits) {
      throw new Error(
        "Parent or guardian name, email, and phone are required for paper intake."
      );
    }

    if (!emergencyName || !emergencyPhoneDigits) {
      throw new Error(
        "Emergency contact name and phone are required."
      );
    }

    if (!city || !state) {
      throw new Error("City and state are required.");
    }

    if (!waiverSignedBy || !waiverSignatureDate) {
      throw new Error(
        "Paper waiver signer and signature date are required."
      );
    }

    const payload = {
      // Identity
      first,
      last,
      fullName: `${first} ${last}`.trim(),
      publicName: publicNameFromParts(first, last),

      dob: dob || null,
      birthYear,
      grade: val("grade") || null,

      // Coach-entered paper intake
      intakeMethod: "paper",
      source: "coach_paper_intake",
      paperIntakeVerified: true,
      notes: val("notes") || "",

      // Family
      parent: {
        name: parentName,
        email: parentEmail,
        phoneDigits: parentPhoneDigits,
      },

      parentName,
      parentEmail,
      parentPhoneDigits,

      // Safety
      emergency: {
        name: emergencyName,
        phoneDigits: emergencyPhoneDigits,
      },

      emergencyName,
      emergencyPhoneDigits,
      medical,

      // Paper waiver record
      waiver: {
        viewed: true,
        agreed: true,
        method: "paper",
        signatureName: waiverSignedBy,
        signatureDate: waiverSignatureDate,
        verifiedByCoach: true,
      },

      // Location / team
      team: val("team") || null,
      city,
      state,
      location: {
        team: val("team") || null,
        city,
        state,
        locationId: placement.locationId,
      },

      // Placement source of truth
      track,
      program,

      framework: placement.framework,
      journey: placement.journey,
      programTrack: placement.programTrack,
      art: placement.art,
      discipline: placement.discipline,
      primaryDiscipline: placement.primaryDiscipline,
      ladderKey: placement.ladderKey,
      rosterIds: placement.rosterIds,
      coachIds: placement.coachIds,
      locationId: placement.locationId,
      trackCode: placement.trackCode,
      profileType: placement.profileType,
      beltSet: placement.beltSet,
      badgeSet: placement.badgeSet,

      placement: {
        ...placement,
        source: "coach_paper_intake",
      },

      virtueName,
      virtueCode,
      mintVirtueTag,

      experience: {
        years: experienceYears,
        placementOnly: true,
        grantsXP: false,
        transferXP: false,
        source: "coach_paper_intake",
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
          track: placement.track,
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
            source: "coach_paper_intake",
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

    if ($("submitBtnLabel")) {
      $("submitBtnLabel").textContent =
        isAddDisciplineMode()
          ? "Verify & Add Discipline"
          : "Verify Paper Intake & Create Athlete";
    }
  }
});