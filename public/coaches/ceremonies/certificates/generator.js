const BELTS_V1 = {
  f8: {
    0: "/assets/img/belts/whitegraybelt.png",
    1: "/assets/img/belts/yellowgraybelt.png",
    2: "/assets/img/belts/orangegraybelt.png",
    3: "/assets/img/belts/greengraybelt.png",
    4: "/assets/img/belts/bluegraybelt.png",
    5: "/assets/img/belts/purplegraybelt.png",
    6: "/assets/img/belts/browngraybelt.png",
    7: "/assets/img/belts/blackgraybelt.png"
  },

  f4: {
    0: "/assets/img/belts/T0.1-whitebelt.png",
    1: "/assets/img/belts/T1-bluebelt.png",
    2: "/assets/img/belts/T2-purplebelt.png",
    3: "/assets/img/belts/T3-brownbelt.png",
    4: "/assets/img/belts/T4-blackbelt.png"
  },

  f4Striking: {
    0: "/assets/img/belts/T0-graybelt.png",
    1: "/assets/img/belts/T1-bluebelt.png",
    2: "/assets/img/belts/T2-purplebelt.png",
    3: "/assets/img/belts/T3-brownbelt.png",
    4: "/assets/img/belts/T4-blackbelt.png"
  },

r2g: {
  0: "/assets/img/belts/T0-graybelt.png",
  1: "/assets/img/belts/T1-bluebelt.png",
  2: "/assets/img/belts/T2-purplebelt.png",
  3: "/assets/img/belts/T3-brownbelt.png",
  4: "/assets/img/belts/T4-blackbelt.png"
},

q2m: {
  0: "/assets/img/belts/T0-graybelt.png",
  1: "/assets/img/belts/T1-bluebelt.png",
  2: "/assets/img/belts/T2-purplebelt.png",
  3: "/assets/img/belts/T3-brownbelt.png",
  4: "/assets/img/belts/T4-blackbelt.png"
},

};

const BELTS_V2 = {
  f8: {
    0: "/assets/img/belts/whitegraybelt-v2.png",
    1: "/assets/img/belts/yellowgraybelt-v2.png",
    2: "/assets/img/belts/orangegraybelt-v2.png",
    3: "/assets/img/belts/greengraybelt-v2.png",
    4: "/assets/img/belts/bluegraybelt-v2.png",
    5: "/assets/img/belts/purplegraybelt-v2.png",
    6: "/assets/img/belts/browngraybelt-v2.png",
    7: "/assets/img/belts/blackgraybelt-v2.png"
  },

  f4: {
    0: "/assets/img/belts/whitebelt-v2.png",
    1: "/assets/img/belts/bluebelt-v2.png",
    2: "/assets/img/belts/purplebelt-v2.png",
    3: "/assets/img/belts/brownbelt-v2.png",
    4: "/assets/img/belts/blackbelt-v2.png"
  },

  f4Striking: {
    0: "/assets/img/belts/graybelt-v2.png",
    1: "/assets/img/belts/bluebelt-v2.png",
    2: "/assets/img/belts/purplebelt-v2.png",
    3: "/assets/img/belts/brownbelt-v2.png",
    4: "/assets/img/belts/blackbelt-v2.png"
  },

r2g: {
  0: "/assets/img/belts/graybelt-v2.png",
  1: "/assets/img/belts/bluebelt-v2.png",
  2: "/assets/img/belts/purplebelt-v2.png",
  3: "/assets/img/belts/brownbelt-v2.png",
  4: "/assets/img/belts/blackbelt-v2.png"
},

q2m: {
  0: "/assets/img/belts/graybelt-v2.png",
  1: "/assets/img/belts/bluebelt-v2.png",
  2: "/assets/img/belts/purplebelt-v2.png",
  3: "/assets/img/belts/brownbelt-v2.png",
  4: "/assets/img/belts/blackbelt-v2.png"
},

};

const BELT_HOTSPOTS = {
f8: {
  default: {
    right: "10.5%",
    top: "34%",
    width: "18px",
    height: "42px",
    gap: "12px"
  },

  0: {
    right: "10.5%",
    top: "45%",
    width: "18px",
    height: "44px",
    gap: "18px"
  }
},

f4: {
  default: {
    right: "10.5%",
    top: "33.5%",
    width: "16px",
    height: "44px",
    gap: "10px"
  }
},

r2g: {
  default: {
    right: "10.5%",
    top: "33.5%",
    width: "16px",
    height: "44px",
    gap: "10px"
  }
},

q2m: {
  default: {
    right: "10.5%",
    top: "33.5%",
    width: "16px",
    height: "44px",
    gap: "10px"
  }
}
};

const CERTIFICATE_PRESETS = {
  f4: {
    label: "Foundry 4",
    journey: "Path2Legend™",
    tiers: {
      0: {
        rank: "Apprentice",
        quote: "The forge reveals character.",
        stripes: ["I", "II", "III", "IV"]
      },
      1: {
        rank: "Warrior",
        quote: "Courage grows through challenge.",
        stripes: ["I", "II", "III", "IV"]
      },
      2: {
        rank: "Champion",
        quote: "Victory belongs to the prepared.",
        stripes: ["I", "II", "III", "IV"]
      },
      3: {
        rank: "Veteran",
        quote: "Experience sharpens the blade.",
        stripes: ["I", "II", "III", "IV"]
      },
      4: {
        rank: "Legend",
        quote: "Legends leave a path for others.",
        stripes: ["I", "II", "III", "IV"]
      }
    }
  },


r2g: {
  label: "Road to Greatness",
  journey: "Road2Greatness™",
  tiers: {
    0: { rank: "Apprentice", quote: "The forge reveals character.", stripes: ["I", "II", "III", "IV"] },
    1: { rank: "Warrior", quote: "Courage grows through challenge.", stripes: ["I", "II", "III", "IV"] },
    2: { rank: "Champion", quote: "Victory belongs to the prepared.", stripes: ["I", "II", "III", "IV"] },
    3: { rank: "Veteran", quote: "Experience sharpens the blade.", stripes: ["I", "II", "III", "IV"] },
    4: { rank: "Greatness", quote: "Greatness is earned one round at a time.", stripes: ["I", "II", "III", "IV"] }
  }
},

q2m: {
  label: "Quest to Mastery",
  journey: "Quest2Mastery™",
  tiers: {
    0: { rank: "Apprentice", quote: "The forge reveals character.", stripes: ["I", "II", "III", "IV"] },
    1: { rank: "Warrior", quote: "Courage grows through challenge.", stripes: ["I", "II", "III", "IV"] },
    2: { rank: "Champion", quote: "Victory belongs to the prepared.", stripes: ["I", "II", "III", "IV"] },
    3: { rank: "Veteran", quote: "Experience sharpens the blade.", stripes: ["I", "II", "III", "IV"] },
    4: { rank: "Mastery", quote: "Mastery is earned through pressure, patience, and purpose.", stripes: ["I", "II", "III", "IV"] }
  }
},

  f8: {
    label: "Foundry 8",
    journey: "Zero2Hero™",
    tiers: {
      0: {
        rank: "Shadow",
        quote: "Greatness begins unseen.",
        stripes: ["I", "II", "III"]
      },
      1: {
        rank: "Recruit",
        quote: "The first steps build the path.",
        stripes: ["I", "II", "III", "IV"]
      },
      2: {
        rank: "Contender",
        quote: "Skill grows through repetition.",
        stripes: ["I", "II", "III", "IV"]
      },
      3: {
        rank: "Competitor",
        quote: "Pressure reveals preparation.",
        stripes: ["I", "II", "III", "IV"]
      },
      4: {
        rank: "Warrior",
        quote: "Discipline defeats doubt.",
        stripes: ["I", "II", "III", "IV"]
      },
      5: {
        rank: "Champion",
        quote: "Champions are built one day at a time.",
        stripes: ["I", "II", "III", "IV"]
      },
      6: {
        rank: "Commander",
        quote: "Leadership is earned through service.",
        stripes: ["I", "II", "III", "IV"]
      },
      7: {
        rank: "Hero",
        quote: "Heroes build heroes.",
        stripes: ["I", "II", "III", "IV"]
      }
    }
  }
};

const DISCIPLINE_OPTIONS = {
  f8: [
    { value: "wrestling", label: "Wrestling" },
    { value: "kickboxing", label: "Kickboxing" }
  ],

  f4: [
    { value: "wrestling", label: "Wrestling" },
    {
      value: "submission-grappling",
      label: "Submission Grappling"
    },
    { value: "boxing", label: "Boxing" },
    { value: "kickboxing", label: "Kickboxing" }
  ],

  q2m: [
    { value: "mma", label: "MMA" }
  ]
};

function disciplineLabel(value = "") {
  const key = String(value || "")
    .trim()
    .toLowerCase();

  const options =
    Object.values(DISCIPLINE_OPTIONS).flat();

  const match =
    options.find((item) => item.value === key);

  if (match) return match.label;

  return key
    .split("-")
    .filter(Boolean)
    .map(
      (part) =>
        part.charAt(0).toUpperCase() +
        part.slice(1)
    )
    .join(" ");
}

function beltFamilyFor(foundryKey, discipline) {
  const journey = String(foundryKey || "")
    .trim()
    .toLowerCase();

  const art = String(discipline || "")
    .trim()
    .toLowerCase();

  if (journey !== "f4") {
    return journey;
  }

  return ["boxing", "kickboxing"].includes(art)
    ? "f4Striking"
    : "f4";
}

const fields = {
  mode: document.getElementById("mode"),
  beltStyle: document.getElementById("beltStyle"),
  foundry: document.getElementById("foundry"),
  discipline: document.getElementById("discipline"),
  tier: document.getElementById("tier"),
  stripe: document.getElementById("stripe"),
  athleteName: document.getElementById("athleteName"),
  academyName: document.getElementById("academyName"),
  coach: document.getElementById("coach"),
  date: document.getElementById("date"),
  beltImage: document.getElementById("beltImage")
};

const output = {
  athlete: document.getElementById("outAthlete"),
  academy: document.getElementById("outAcademy"),
  journey: document.getElementById("outJourney"),
  discipline: document.getElementById("outDisciplineLine"),
  rank: document.getElementById("outRank"),
  tier: document.getElementById("outTier"),
  stripe: document.getElementById("outStripe"),
  quote: document.getElementById("outQuote"),
  coach: document.getElementById("outCoach"),
  date: document.getElementById("outDate"),
  belt: document.getElementById("outBelt")
};

const ENGINE_ENDPOINTS = {
  certificatePayload:
    "https://us-central1-sandmandashboard.cloudfunctions.net/testCertificatePayloadEngine"
};

// Set only when the certificate was loaded from the backend engine.
// Manual certificate mode remains available to the coach.
let enginePayloadState = {
  loaded: false,
  printReady: true,
  ceremonyEligible: true,
  reason: null,
  message: ""
};

function romanToNumber(value) {
  const map = {
    I: 1,
    II: 2,
    III: 3,
    IV: 4
  };

  return map[value] || 0;
}

function numberToRoman(value) {
  const map = {
    1: "I",
    2: "II",
    3: "III",
    4: "IV"
  };

  return map[value] || "I";
}

function resolveFoundryKey(programCode) {
  const raw = String(programCode || "")
    .trim()
    .toLowerCase();

  if (
    raw === "f8" ||
    raw.includes("foundry8") ||
    raw.includes("zero2hero") ||
    raw.includes("youth")
  ) {
    return "f8";
  }

  if (
    raw === "q2m" ||
    raw === "adult" ||
    raw.includes("quest2mastery") ||
    raw.includes("mastery")
  ) {
    return "q2m";
  }

  // Reserved compatibility for the future Sandman Sports pathway.
  if (
    raw === "r2g" ||
    raw.includes("road2greatness")
  ) {
    return "r2g";
  }

  return "f4";
}

function applyCertificatePayload(payload) {
  enginePayloadState = {
    loaded: true,
    printReady: payload?.printReady === true,
    ceremonyEligible: payload?.ceremonyEligible !== false,
    reason: payload?.reason || null,
    message: payload?.message || ""
  };

  if (
    !payload ||
    payload.printReady !== true ||
    payload.ceremonyEligible === false
  ) {
    const message =
      payload?.message ||
      (
        payload?.reason === "LEGACY_PLACEMENT"
          ? "Legacy placement is recognized, but this stripe is not eligible for a Sandman certificate."
          : "No printable certificate is ready."
      );

    console.warn("Certificate payload blocked.", payload);
    alert(message);
    return false;
  }

  const foundryKey = resolveFoundryKey(
    payload.programCode ||
    payload.programName ||
    payload.journey
  );

  const preset = CERTIFICATE_PRESETS[foundryKey];

  if (!preset) {
    throw new Error(
      `Unsupported certificate program: ${payload.programCode || "unknown"}`
    );
  }

  const tierNumber = Number(
    String(payload.tier ?? 0).match(/\d+/)?.[0] ?? 0
  );

  const safeTier = preset.tiers[tierNumber]
    ? tierNumber
    : 0;

  const stripeValue = numberToRoman(
    Math.max(1, Math.min(4, Number(payload.stripe || 1)))
  );

  fields.mode.value = "filled";
  fields.beltStyle.value = "v2";
  fields.foundry.value = foundryKey;

  populateDisciplineOptions(
    payload.discipline ||
    payload.art ||
    payload.primaryDiscipline ||
    ""
  );

  populateTierOptions();
  fields.tier.value = String(safeTier);

  populateStripeOptions();

  const allowedStripes =
    CERTIFICATE_PRESETS[foundryKey]
      ?.tiers?.[safeTier]
      ?.stripes || [];

  fields.stripe.value = allowedStripes.includes(stripeValue)
    ? stripeValue
    : allowedStripes[0] || "I";

  fields.athleteName.value =
    payload.athleteName || "";

  fields.academyName.value =
    payload.academyName ||
    payload.academy ||
    payload.team ||
    fields.academyName.value ||
    "Sandman Academy";

  fields.coach.value =
    payload.coach ||
    fields.coach.value ||
    "Coach Sandoval";

  const date = payload.dateAwarded
    ? new Date(payload.dateAwarded)
    : new Date();

  fields.date.value = Number.isNaN(date.getTime())
    ? new Date().toLocaleDateString("en-US")
    : date.toLocaleDateString("en-US");

  updateCertificate();
  return true;
}

async function loadCertificatePayloadFromEngine(uid) {
  const url =
    `${ENGINE_ENDPOINTS.certificatePayload}?uid=${encodeURIComponent(uid)}`;

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Engine request failed: ${response.status}`);
  }

  const data = await response.json();

  if (!data.success) {
    throw new Error(data.error || "Engine returned failure.");
  }

  const applied = applyCertificatePayload(data.payload);

  if (applied) {
    console.log("Loaded printable certificate payload:", data);
  } else {
    console.log("Certificate payload was not print eligible:", data);
  }
}

function autoLoadFromQuery() {
  const params = new URLSearchParams(window.location.search);
  const uid = params.get("uid");

  if (!uid) return;

  loadCertificatePayloadFromEngine(uid).catch((err) => {
    console.error(err);
    alert(`Could not load certificate payload: ${err.message}`);
  });
}


function getPreset() {
  const foundryKey = fields.foundry.value;
  const tierKey = fields.tier.value;

  return CERTIFICATE_PRESETS[foundryKey].tiers[tierKey];
}

function getActiveBelts() {
  return fields.beltStyle.value === "v2"
    ? BELTS_V2
    : BELTS_V1;
}

function populateDisciplineOptions(preferred = "") {
  if (!fields.discipline) return;

  const foundryKey =
    fields.foundry.value;

  const options =
    DISCIPLINE_OPTIONS[foundryKey] || [];

  const wanted = String(
    preferred ||
    fields.discipline.value ||
    ""
  )
    .trim()
    .toLowerCase();

  fields.discipline.innerHTML = "";

  options.forEach((item) => {
    const option =
      document.createElement("option");

    option.value = item.value;
    option.textContent = item.label;

    fields.discipline.appendChild(option);
  });

  const isValid =
    options.some(
      (item) => item.value === wanted
    );

  fields.discipline.value =
    isValid
      ? wanted
      : options[0]?.value || "";
}

function populateTierOptions() {
  const foundryKey = fields.foundry.value;
  const tiers = CERTIFICATE_PRESETS[foundryKey].tiers;

  fields.tier.innerHTML = "";

  Object.keys(tiers).forEach((tierKey) => {
    const option = document.createElement("option");

    option.value = tierKey;
    option.textContent =
      `Tier ${tierKey} · ${tiers[tierKey].rank}`;

    fields.tier.appendChild(option);
  });
}

function populateStripeOptions() {
  const preset = getPreset();

  fields.stripe.innerHTML = "";

  preset.stripes.forEach((stripe) => {
    const option = document.createElement("option");

    option.value = stripe;
    option.textContent = `Stripe ${stripe}`;

    fields.stripe.appendChild(option);
  });
}

function setManualLine(element, short = false) {
  element.textContent = short
    ? "________________"
    : "____________________________";
}

function renderBeltStripes(stripe, foundryKey, tierKey) {
  const overlay = document.getElementById("beltStripeOverlay");
  if (!overlay) return;

  const isDigital =
    fields.beltStyle.value === "v2";

  overlay.style.display = isDigital ? "flex" : "none";

  if (!isDigital) return;

  const family =
    BELT_HOTSPOTS[foundryKey] || BELT_HOTSPOTS.f8;

  const hotspot =
    family[tierKey] ||
    family.default ||
    family;

  overlay.style.right = hotspot.right;
  overlay.style.top = hotspot.top;
  overlay.style.gap = hotspot.gap;

  const stripeMap = {
    I: 1,
    II: 2,
    III: 3,
    IV: 4
  };

  const count = stripeMap[stripe] || 0;

  overlay.innerHTML = "";

  for (let i = 0; i < count; i++) {
    const mark = document.createElement("span");
    mark.className = "earned-belt-stripe";
    mark.style.width = hotspot.width;
    mark.style.height = hotspot.height;
    overlay.appendChild(mark);
  }
}

function enableStripeDevDrag() {
  const overlay = document.getElementById("beltStripeOverlay");
  const wrap = document.querySelector(".belt-wrap");

  if (!overlay || !wrap) return;

  overlay.style.cursor = "move";
  overlay.style.pointerEvents = "auto";

  let dragging = false;

  overlay.addEventListener("mousedown", () => {
    dragging = true;
  });

  window.addEventListener("mouseup", () => {
    dragging = false;
  });

  window.addEventListener("mousemove", (event) => {
    if (!dragging) return;

    const rect = wrap.getBoundingClientRect();

    const xPercent =
      ((rect.right - event.clientX) / rect.width) * 100;

    const yPercent =
      ((event.clientY - rect.top) / rect.height) * 100;

    overlay.style.right = `${xPercent.toFixed(2)}%`;
    overlay.style.top = `${yPercent.toFixed(2)}%`;

    console.log({
      right: `${xPercent.toFixed(2)}%`,
      top: `${yPercent.toFixed(2)}%`
    });
  });
}

function updateCertificate() {
  const foundryKey = fields.foundry.value;
  const tier = fields.tier.value;
  const stripe = fields.stripe.value;

  const preset = getPreset();
  const foundry = CERTIFICATE_PRESETS[foundryKey];

  const isManual =
    fields.mode.value === "manual";

  output.journey.textContent =
    foundry.journey.toUpperCase();

  if (output.discipline) {
    const selectedDiscipline =
      fields.discipline?.value || "";

    output.discipline.textContent =
      selectedDiscipline
        ? `COMBAT DISCIPLINE · ${
            disciplineLabel(
              selectedDiscipline
            ).toUpperCase()
          }`
        : "";
  }

  output.rank.textContent =
    `${preset.rank.toUpperCase()} RANK`;

  output.tier.textContent =
    `TIER ${tier}`;

  output.stripe.textContent =
    `STRIPE ${stripe}`;

  output.quote.textContent =
    `“${preset.quote}”`;

  if (isManual) {
    setManualLine(output.athlete);
    setManualLine(output.academy);
    setManualLine(output.coach, true);
    setManualLine(output.date, true);
  } else {
    output.athlete.textContent =
      (fields.athleteName.value.trim() || "ATHLETE NAME")
        .toUpperCase();

    output.academy.textContent =
      (fields.academyName.value.trim() || "ACADEMY NAME")
        .toUpperCase();

    output.coach.textContent =
      fields.coach.value.trim() || "Coach";

    output.date.textContent =
      fields.date.value.trim() || "Date";
  }

  const manualBeltPath =
    fields.beltImage?.value.trim();

  const activeBelts = getActiveBelts();

  const beltFamily =
    beltFamilyFor(
      foundryKey,
      fields.discipline?.value
    );

  const autoBeltPath =
    activeBelts?.[beltFamily]?.[
      Number(tier)
    ] || "";

  output.belt.src =
    manualBeltPath || autoBeltPath;

  output.belt.style.display =
    output.belt.src ? "block" : "none";

  renderBeltStripes(stripe, foundryKey, Number(tier));
}

fields.foundry.addEventListener("change", () => {
  populateDisciplineOptions();
  populateTierOptions();
  populateStripeOptions();
  updateCertificate();
});

fields.tier.addEventListener("change", () => {
  populateStripeOptions();
  updateCertificate();
});

Object.values(fields).forEach((field) => {
  if (!field) return;

  field.addEventListener("input", updateCertificate);
  field.addEventListener("change", updateCertificate);
});

document.getElementById("printBtn").addEventListener("click", () => {
  if (
    enginePayloadState.loaded &&
    (
      enginePayloadState.printReady !== true ||
      enginePayloadState.ceremonyEligible === false
    )
  ) {
    alert(
      enginePayloadState.message ||
      (
        enginePayloadState.reason === "LEGACY_PLACEMENT"
          ? "Legacy placement is recognized, but this stripe is not eligible for a Sandman certificate."
          : "No printable certificate is ready."
      )
    );

    return;
  }

  updateCertificate();
  window.print();
});

populateDisciplineOptions();
populateTierOptions();
populateStripeOptions();
updateCertificate();
autoLoadFromQuery();

/* enable only while locally tuning overlay */
// enableStripeDevDrag();