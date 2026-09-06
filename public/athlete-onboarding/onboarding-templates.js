export const ONBOARDING_TEMPLATE_KEYS = Object.freeze({
  ROAD2CHAMPION_FAMILY: "road2champion-family",
  PATH2LEGEND_FAMILY: "path2legend-family",
  PATH2LEGEND_INDEPENDENT: "path2legend-independent",
  QUEST2MASTERY_INDEPENDENT: "quest2mastery-independent",
  SAFE_FALLBACK: "safe-fallback",
});

const YOUTH_TRAITS = Object.freeze({
  honor: { heading: "Honor", question: "Are you honest?", helper: "Choose the answer that feels true today." },
  strong: { heading: "Strong", question: "Are you strong?", helper: "Choose the answer that feels true today." },
  fast: { heading: "Fast", question: "Are you fast?", helper: "Choose the answer that feels true today." },
  smart: { heading: "Good Choices", question: "Do you make good choices?", helper: "Choose the answer that feels true today." },
  courage: { heading: "Courage", question: "Are you brave?", helper: "Choose the answer that feels true today." },
});

const MATURE_TRAITS = Object.freeze({
  honor: { heading: "Honor", question: "How honest are you with yourself and others?", helper: "Rate where you are today from 1 to 10." },
  strong: { heading: "Strong", question: "How strong do you feel today?", helper: "Rate where you are today from 1 to 10." },
  fast: { heading: "Fast", question: "How would you rate your speed today?", helper: "Rate where you are today from 1 to 10." },
  smart: { heading: "Smart", question: "How well do you make thoughtful choices?", helper: "Rate where you are today from 1 to 10." },
  courage: { heading: "Courage", question: "How courageously do you face difficult things?", helper: "Rate where you are today from 1 to 10." },
});

const matureFinisher = Object.freeze({
  heading: "Finisher",
  question: "Do you finish what you start?",
  helper: "Answer honestly. This is your Day 1 starting point.",
  noLabel: "No",
});

const TEMPLATES = Object.freeze({
  [ONBOARDING_TEMPLATE_KEYS.ROAD2CHAMPION_FAMILY]: Object.freeze({
    label: "Road2Champion · Family Connected",
    answerMode: "yes_no",
    traits: YOUTH_TRAITS,
    finisher: { heading: "Finisher", question: "Do you finish what you start?", helper: "Choose Yes or Not yet.", noLabel: "Not yet" },
    identity: { kind: "hero", heading: "Your Hero", question: "Who's your hero?", helper: "Name someone who inspires you.", placeholder: "Your hero's name" },
  }),
  [ONBOARDING_TEMPLATE_KEYS.PATH2LEGEND_FAMILY]: Object.freeze({
    label: "Path2Legend · Family Connected", answerMode: "numeric", traits: MATURE_TRAITS, finisher: matureFinisher,
    identity: { kind: "legend", heading: "Your Legend", question: "Who's your legend?", helper: "Name the person or example that helps guide who you are becoming.", placeholder: "Your legend's name" },
  }),
  [ONBOARDING_TEMPLATE_KEYS.PATH2LEGEND_INDEPENDENT]: Object.freeze({
    label: "Path2Legend · Independent", answerMode: "numeric", traits: MATURE_TRAITS, finisher: matureFinisher,
    identity: { kind: "legend", heading: "Your Legend", question: "Who's your legend?", helper: "Name the person or example that helps guide who you are becoming.", placeholder: "Your legend's name" },
  }),
  [ONBOARDING_TEMPLATE_KEYS.QUEST2MASTERY_INDEPENDENT]: Object.freeze({
    label: "Quest2Mastery · Independent", answerMode: "numeric", traits: MATURE_TRAITS,
    finisher: { ...matureFinisher, heading: "Commitment" },
    identity: { kind: "mastery", heading: "Your Quest", question: "What are you trying to master?", helper: "Name the craft, quality, or challenge you intend to pursue.", placeholder: "What you are trying to master" },
  }),
  [ONBOARDING_TEMPLATE_KEYS.SAFE_FALLBACK]: Object.freeze({
    label: "Athlete Onboarding", answerMode: "numeric", traits: MATURE_TRAITS, finisher: matureFinisher,
    identity: { kind: "anchor", heading: "Your Identity Anchor", question: "Who or what inspires the athlete you are becoming?", helper: "Add one meaningful name or focus.", placeholder: "Your identity anchor" },
  }),
});

export function normalizeOnboardingRelationship(value) {
  const key = String(value || "").trim().toLowerCase().replaceAll("-", "_");
  if (["parent_guardian", "parent", "guardian"].includes(key)) return "family";
  if (["adult_athlete", "athlete", "independent"].includes(key)) return "independent";
  return "unknown";
}

export function normalizeOnboardingJourney(value) {
  const key = String(value || "").trim().toLowerCase().replaceAll("_", "").replaceAll("-", "");
  if (["zero2hero", "road2champion"].includes(key)) return "road2champion";
  if (["path2legend", "road2glory", "adultboxing"].includes(key)) return "path2legend";
  if (key === "quest2mastery") return "quest2mastery";
  return "unknown";
}

export function resolveOnboardingTemplate(athlete = {}) {
  const relationshipMode = normalizeOnboardingRelationship(
    athlete.registrantRole || athlete.intakeAudience || athlete.onboarding?.registrantRole || athlete.onboarding?.intakeAudience
  );
  const journey = normalizeOnboardingJourney(
    athlete.programTrack || athlete.placement?.programTrack || athlete.journey || athlete.track
  );
  let templateKey = ONBOARDING_TEMPLATE_KEYS.SAFE_FALLBACK;
  if (journey === "road2champion" && relationshipMode === "family") templateKey = ONBOARDING_TEMPLATE_KEYS.ROAD2CHAMPION_FAMILY;
  if (journey === "path2legend" && relationshipMode === "family") templateKey = ONBOARDING_TEMPLATE_KEYS.PATH2LEGEND_FAMILY;
  if (journey === "path2legend" && relationshipMode === "independent") templateKey = ONBOARDING_TEMPLATE_KEYS.PATH2LEGEND_INDEPENDENT;
  if (journey === "quest2mastery" && relationshipMode === "independent") templateKey = ONBOARDING_TEMPLATE_KEYS.QUEST2MASTERY_INDEPENDENT;
  return { relationshipMode, journey, templateKey, template: TEMPLATES[templateKey] };
}

export function day1SnapshotView(athlete = {}) {
  const onboarding = athlete.onboarding || {};
  if (onboarding.day1Snapshot && typeof onboarding.day1Snapshot === "object") return onboarding.day1Snapshot;
  const resolved = resolveOnboardingTemplate(athlete);
  return {
    templateKey: resolved.templateKey,
    relationshipMode: resolved.relationshipMode,
    journey: resolved.journey,
    selfAssess: { ...(onboarding.selfAssess || {}) },
    identity: { ...(onboarding.identity || {}) },
  };
}
