const BELTS = {
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
        rank: "Combatant",
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

const fields = {
  mode: document.getElementById("mode"),
  foundry: document.getElementById("foundry"),
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
  rank: document.getElementById("outRank"),
  tier: document.getElementById("outTier"),
  stripe: document.getElementById("outStripe"),
  quote: document.getElementById("outQuote"),
  coach: document.getElementById("outCoach"),
  date: document.getElementById("outDate"),
  belt: document.getElementById("outBelt")
};

function getPreset() {
  const foundryKey = fields.foundry.value;
  const tierKey = fields.tier.value;

  return CERTIFICATE_PRESETS[foundryKey].tiers[tierKey];
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

function renderBeltStripes(stripe) {
  const overlay = document.getElementById("beltStripeOverlay");

  if (!overlay) return;

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
    overlay.appendChild(mark);
  }
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

  const autoBeltPath =
    BELTS?.[foundryKey]?.[Number(tier)] || "";

  output.belt.src =
    manualBeltPath || autoBeltPath;

  output.belt.style.display =
    output.belt.src ? "block" : "none";

  renderBeltStripes(stripe);
}

fields.foundry.addEventListener("change", () => {
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
  updateCertificate();
  window.print();
});

populateTierOptions();
populateStripeOptions();
updateCertificate();
