const BELTS = {
  f8: {
    0: {
      I: "/assets/img/belts/f8-shadow-s1.png",
      II: "/assets/img/belts/f8-shadow-s2.png",
      III: "/assets/img/belts/f8-shadow-s3.png"
    },

    1: {
      I: "/assets/img/belts/f8-recruit-s1.png",
      II: "/assets/img/belts/f8-recruit-s2.png",
      III: "/assets/img/belts/f8-recruit-s3.png",
      IV: "/assets/img/belts/f8-recruit-s4.png"
    }
  },

  f4: {
    0: {
      I: "/assets/img/belts/f4-apprentice-s1.png",
      II: "/assets/img/belts/f4-apprentice-s2.png",
      III: "/assets/img/belts/f4-apprentice-s3.png",
      IV: "/assets/img/belts/f4-apprentice-s4.png"
    },

    1: {
      I: "/assets/img/belts/f4-warrior-s1.png",
      II: "/assets/img/belts/f4-warrior-s2.png",
      III: "/assets/img/belts/f4-warrior-s3.png",
      IV: "/assets/img/belts/f4-warrior-s4.png"
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
  BELTS?.[foundryKey]?.[tier]?.[stripe] ||
  "/assets/img/belts/placeholder.png";

    if (!autoBeltPath && !manualBeltPath) {
  console.warn(
    `Missing belt asset for ${foundryKey} T${tier} Stripe ${stripe}`
  );
}

  output.belt.src =
    manualBeltPath || autoBeltPath;

  output.belt.style.display =
    output.belt.src ? "block" : "none";
}

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
