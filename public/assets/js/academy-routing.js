/**
 * Sandman Academy Routing
 * -----------------------
 * Central routing configuration for:
 *
 * - Sandman-operated academies
 * - Partner fitness studios
 * - Independent combat studios
 * - Combat studios using Sandman fitness tools
 * - After-school and youth-development programs
 *
 * Public forms should never hard-code:
 *
 *   fitness -> YESC
 *
 * They should ask this routing layer:
 *
 *   academy + selected interest -> assigned destination
 *
 * This file controls routing only.
 * It does not submit forms or write lead records.
 */

const DEFAULT_ACADEMY_ID = "sandman";
const DEFAULT_LANGUAGE = "en";

export const ACADEMY_MODELS = Object.freeze({
  FULL_ACADEMY: "full-academy",

  PARTNER_FITNESS_STUDIO: "partner-fitness-studio",

  COMBAT_STUDIO: "combat-studio",

  COMBAT_WITH_FITNESS_TOOLS: "combat-with-fitness-tools",

  AFTER_SCHOOL_PARTNER: "after-school-partner"
});

export const INTEREST_TYPES = Object.freeze({
  COMBAT: "combat",
  FITNESS: "fitness",
  BOTH: "both",
  AFTER_SCHOOL: "after-school"
});

export const PROVIDER_TYPES = Object.freeze({
  SANDMAN: "sandman",
  ACADEMY: "academy",
  PARTNER: "partner",
  SHARED: "shared",
  EXTERNAL: "external"
});

export const DELIVERY_TYPES = Object.freeze({
  IN_PERSON: "in-person",

  DIGITAL_ASSISTED: "digital-assisted",

  SCREEN_FACILITATED: "screen-facilitated",

  HYBRID: "hybrid"
});

/**
 * Academy routing registry
 *
 * Every academy may assign a different destination for:
 *
 * - combat
 * - fitness
 * - both
 * - after-school
 *
 * Disabled academies may be configured before launch.
 * They will not be used until active is set to true.
 */
export const ACADEMY_ROUTES = Object.freeze({
  /**
   * Default Sandman-controlled academy model.
   *
   * Sandman handles combat, fitness, and combined interest.
   */
  sandman: {
    id: "sandman",

    name: "Sandman Academy of Combat & Fitness",

    active: true,

    model: ACADEMY_MODELS.FULL_ACADEMY,

    location: {
      city: "Solvang",
      state: "CA"
    },

    providers: {
      combat: PROVIDER_TYPES.SANDMAN,
      fitness: PROVIDER_TYPES.SANDMAN,
      afterSchool: PROVIDER_TYPES.SANDMAN
    },

    capabilities: {
      combat: true,
      fitness: true,
      both: true,
      afterSchool: true,

      fitnessTools: true,
      screenFacilitatedClasses: true,
      digitalProgramming: true,
      timersAndTransitions: true,
      exerciseCueing: true
    },

    routes: {
      combat: {
        provider: PROVIDER_TYPES.SANDMAN,
        delivery: DELIVERY_TYPES.IN_PERSON,
        destination: "/connect/interest/"
      },

      fitness: {
        provider: PROVIDER_TYPES.SANDMAN,
        delivery: DELIVERY_TYPES.HYBRID,
        destination: "/connect/interest/"
      },

      both: {
        provider: PROVIDER_TYPES.SANDMAN,
        delivery: DELIVERY_TYPES.HYBRID,
        destination: "/connect/interest/"
      },

      afterSchool: {
        provider: PROVIDER_TYPES.SANDMAN,
        delivery: DELIVERY_TYPES.SCREEN_FACILITATED,
        destination: "/connect/interest/"
      }
    }
  },

  /**
   * Current YESC collaboration model.
   *
   * Sandman handles combat.
   * YESC handles fitness and youth-development programming.
   */
  yesc: {
    id: "yesc",

    name: "Youth Empowered Sports Club",

    active: true,

    model: ACADEMY_MODELS.PARTNER_FITNESS_STUDIO,

    location: {
      city: "Solvang",
      state: "CA"
    },

    providers: {
      combat: PROVIDER_TYPES.SANDMAN,
      fitness: PROVIDER_TYPES.PARTNER,
      afterSchool: PROVIDER_TYPES.PARTNER
    },

    capabilities: {
      combat: true,
      fitness: true,
      both: true,
      afterSchool: true,

      fitnessTools: true,
      screenFacilitatedClasses: true,
      digitalProgramming: true,
      timersAndTransitions: true,
      exerciseCueing: true
    },

    routes: {
      combat: {
        provider: PROVIDER_TYPES.SANDMAN,
        delivery: DELIVERY_TYPES.IN_PERSON,
        destination: "/connect/interest/"
      },

      fitness: {
        provider: PROVIDER_TYPES.PARTNER,
        delivery: DELIVERY_TYPES.HYBRID,
        destination: "/connect/yesc/"
      },

      both: {
        provider: PROVIDER_TYPES.SHARED,
        delivery: DELIVERY_TYPES.HYBRID,
        destination: "/connect/interest/"
      },

      afterSchool: {
        provider: PROVIDER_TYPES.PARTNER,
        delivery: DELIVERY_TYPES.SCREEN_FACILITATED,
        destination: "/connect/yesc/"
      }
    }
  },

  /**
   * Future independent combat studio example.
   *
   * This record is intentionally inactive.
   * It demonstrates how a local studio can operate its own
   * combat program while using Sandman fitness tools.
   */
  "future-combat-studio": {
    id: "future-combat-studio",

    name: "Future Combat Studio",

    active: false,

    model: ACADEMY_MODELS.COMBAT_WITH_FITNESS_TOOLS,

    location: {
      city: "",
      state: ""
    },

    providers: {
      combat: PROVIDER_TYPES.ACADEMY,
      fitness: PROVIDER_TYPES.ACADEMY,
      afterSchool: PROVIDER_TYPES.ACADEMY
    },

    capabilities: {
      combat: true,
      fitness: true,
      both: true,
      afterSchool: true,

      fitnessTools: true,
      screenFacilitatedClasses: true,
      digitalProgramming: true,
      timersAndTransitions: true,
      exerciseCueing: true
    },

    routes: {
      combat: {
        provider: PROVIDER_TYPES.ACADEMY,
        delivery: DELIVERY_TYPES.IN_PERSON,
        destination: "/connect/interest/"
      },

      fitness: {
        provider: PROVIDER_TYPES.ACADEMY,
        delivery: DELIVERY_TYPES.SCREEN_FACILITATED,
        destination: "/connect/interest/"
      },

      both: {
        provider: PROVIDER_TYPES.ACADEMY,
        delivery: DELIVERY_TYPES.HYBRID,
        destination: "/connect/interest/"
      },

      afterSchool: {
        provider: PROVIDER_TYPES.ACADEMY,
        delivery: DELIVERY_TYPES.SCREEN_FACILITATED,
        destination: "/connect/interest/"
      }
    }
  },

  /**
   * Future school or after-school organization.
   *
   * This model can use Sandman-created 45-minute sessions,
   * screen-based exercise cues, class timers, transitions,
   * and structured workout sequences.
   */
  "future-after-school": {
    id: "future-after-school",

    name: "Future After-School Partner",

    active: false,

    model: ACADEMY_MODELS.AFTER_SCHOOL_PARTNER,

    location: {
      city: "",
      state: ""
    },

    providers: {
      combat: PROVIDER_TYPES.EXTERNAL,
      fitness: PROVIDER_TYPES.PARTNER,
      afterSchool: PROVIDER_TYPES.PARTNER
    },

    capabilities: {
      combat: false,
      fitness: true,
      both: false,
      afterSchool: true,

      fitnessTools: true,
      screenFacilitatedClasses: true,
      digitalProgramming: true,
      timersAndTransitions: true,
      exerciseCueing: true
    },

    routes: {
      combat: {
        provider: PROVIDER_TYPES.EXTERNAL,
        delivery: DELIVERY_TYPES.IN_PERSON,
        destination: "/connect/interest/"
      },

      fitness: {
        provider: PROVIDER_TYPES.PARTNER,
        delivery: DELIVERY_TYPES.SCREEN_FACILITATED,
        destination: "/connect/interest/"
      },

      both: {
        provider: PROVIDER_TYPES.SHARED,
        delivery: DELIVERY_TYPES.HYBRID,
        destination: "/connect/interest/"
      },

      afterSchool: {
        provider: PROVIDER_TYPES.PARTNER,
        delivery: DELIVERY_TYPES.SCREEN_FACILITATED,
        destination: "/connect/interest/"
      }
    }
  }
});

/**
 * Academy aliases allow older or alternate identifiers to resolve
 * without creating duplicate academy records.
 */
const ACADEMY_ALIASES = Object.freeze({
  headquarters: "sandman",
  hq: "sandman",
  solvang: "sandman",
  "sandman-academy": "sandman",

  "youth-empowered-sports-club": "yesc",
  "yesc-solvang": "yesc"
});

/**
 * Normalize an academy identifier.
 */
export function normalizeAcademyId(value = "") {
  const normalized = String(value)
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-");

  if (!normalized) {
    return DEFAULT_ACADEMY_ID;
  }

  return ACADEMY_ALIASES[normalized] || normalized;
}

/**
 * Normalize public interest selections.
 *
 * This accepts current and possible future form values.
 */
export function normalizeInterestType(value = "") {
  const normalized = String(value)
    .trim()
    .toLowerCase()
    .replace(/_/g, "-")
    .replace(/\s+/g, "-");

  const aliases = {
    combat: INTEREST_TYPES.COMBAT,
    wrestling: INTEREST_TYPES.COMBAT,
    boxing: INTEREST_TYPES.COMBAT,
    "muay-thai": INTEREST_TYPES.COMBAT,
    kickboxing: INTEREST_TYPES.COMBAT,
    mma: INTEREST_TYPES.COMBAT,
    grappling: INTEREST_TYPES.COMBAT,

    fitness: INTEREST_TYPES.FITNESS,
    strength: INTEREST_TYPES.FITNESS,
    conditioning: INTEREST_TYPES.FITNESS,
    kidfit: INTEREST_TYPES.FITNESS,
    "kid-fit": INTEREST_TYPES.FITNESS,
    teenfit: INTEREST_TYPES.FITNESS,
    "teen-fit": INTEREST_TYPES.FITNESS,
    hiitfit: INTEREST_TYPES.FITNESS,
    "hiit-fit": INTEREST_TYPES.FITNESS,
    "dawn-patrol": INTEREST_TYPES.FITNESS,
    jumpstart: INTEREST_TYPES.FITNESS,
    "jumpstart-fitness": INTEREST_TYPES.FITNESS,
    preschool: INTEREST_TYPES.FITNESS,
    "preschool-playtime": INTEREST_TYPES.FITNESS,
    powerlifting: INTEREST_TYPES.FITNESS,

    both: INTEREST_TYPES.BOTH,
    combined: INTEREST_TYPES.BOTH,
    "combat-and-fitness": INTEREST_TYPES.BOTH,
    "fitness-and-combat": INTEREST_TYPES.BOTH,

    "after-school": INTEREST_TYPES.AFTER_SCHOOL,
    afterschool: INTEREST_TYPES.AFTER_SCHOOL,
    school: INTEREST_TYPES.AFTER_SCHOOL,
    "youth-program": INTEREST_TYPES.AFTER_SCHOOL,
    "youth-development": INTEREST_TYPES.AFTER_SCHOOL
  };

  return aliases[normalized] || INTEREST_TYPES.COMBAT;
}

/**
 * Convert the normalized public interest value to the route key
 * used inside each academy record.
 */
function getRouteKey(interestType) {
  if (interestType === INTEREST_TYPES.AFTER_SCHOOL) {
    return "afterSchool";
  }

  return interestType;
}

/**
 * Return an academy configuration.
 *
 * Inactive or unknown academies fall back to Sandman.
 */
export function getAcademyConfig(academyId = DEFAULT_ACADEMY_ID) {
  const normalizedId = normalizeAcademyId(academyId);
  const academy = ACADEMY_ROUTES[normalizedId];

  if (!academy || academy.active !== true) {
    return ACADEMY_ROUTES[DEFAULT_ACADEMY_ID];
  }

  return academy;
}

/**
 * Read academy identity from the current page URL.
 *
 * Supported examples:
 *
 *   ?academy=yesc
 *   ?academy=sandman
 *   ?location=yesc
 *   ?site=yesc
 */
export function getAcademyIdFromUrl(
  search = window.location.search
) {
  const params = new URLSearchParams(search);

  const academyId =
    params.get("academy") ||
    params.get("academyId") ||
    params.get("location") ||
    params.get("site") ||
    DEFAULT_ACADEMY_ID;

  return normalizeAcademyId(academyId);
}

/**
 * Read the current language.
 */
export function getLanguageFromUrl(
  search = window.location.search
) {
  const params = new URLSearchParams(search);
  const language = String(
    params.get("lang") || DEFAULT_LANGUAGE
  ).toLowerCase();

  return language === "es" ? "es" : "en";
}

/**
 * Resolve the assigned route for one academy and interest type.
 *
 * This is the main routing valve.
 */
export function resolveAcademyRoute({
  academyId = DEFAULT_ACADEMY_ID,
  interestType = INTEREST_TYPES.COMBAT
} = {}) {
  const academy = getAcademyConfig(academyId);
  const normalizedInterest =
    normalizeInterestType(interestType);

  const routeKey = getRouteKey(normalizedInterest);

  const requestedRoute = academy.routes[routeKey];
  const fallbackRoute = academy.routes.combat;

  const route = requestedRoute || fallbackRoute;

  if (!route || !route.destination) {
    throw new Error(
      `No destination configured for academy "${academy.id}" ` +
      `and interest "${normalizedInterest}".`
    );
  }

  return {
    academyId: academy.id,
    academyName: academy.name,
    academyModel: academy.model,

    interestType: normalizedInterest,

    provider: route.provider,
    delivery: route.delivery,
    destination: route.destination,

    capabilities: {
      ...academy.capabilities
    }
  };
}

/**
 * Build a destination URL while preserving useful intake context.
 */
export function buildAcademyDestination({
  academyId = DEFAULT_ACADEMY_ID,
  interestType = INTEREST_TYPES.COMBAT,
  language = DEFAULT_LANGUAGE,
  additionalParams = {}
} = {}) {
  const route = resolveAcademyRoute({
    academyId,
    interestType
  });

  const destination = new URL(
    route.destination,
    window.location.origin
  );

  destination.searchParams.set(
    "academy",
    route.academyId
  );

  destination.searchParams.set(
    "interest",
    route.interestType
  );

  destination.searchParams.set(
    "lang",
    language === "es" ? "es" : "en"
  );

  Object.entries(additionalParams).forEach(
    ([key, value]) => {
      if (
        value === undefined ||
        value === null ||
        value === ""
      ) {
        return;
      }

      destination.searchParams.set(
        key,
        String(value)
      );
    }
  );

  return destination.pathname +
    destination.search +
    destination.hash;
}

/**
 * Build metadata that should travel with the lead record.
 *
 * This makes future reporting possible even when two academies
 * use the same public form.
 */
export function buildLeadRoutingMetadata({
  academyId = DEFAULT_ACADEMY_ID,
  interestType = INTEREST_TYPES.COMBAT
} = {}) {
  const route = resolveAcademyRoute({
    academyId,
    interestType
  });

  const academy = getAcademyConfig(
    route.academyId
  );

  return {
    academyId: route.academyId,
    academyName: route.academyName,
    academyModel: route.academyModel,

    interestType: route.interestType,

    combatProvider:
      academy.providers.combat,

    fitnessProvider:
      academy.providers.fitness,

    afterSchoolProvider:
      academy.providers.afterSchool,

    assignedProvider:
      route.provider,

    deliveryType:
      route.delivery,

    destinationRoute:
      route.destination,

    fitnessToolsEnabled:
      academy.capabilities.fitnessTools === true,

    screenFacilitatedClasses:
      academy.capabilities
        .screenFacilitatedClasses === true
  };
}

/**
 * Redirect after a routing decision has been made.
 *
 * Call this only after the current form submission succeeds.
 */
export function redirectToAcademyDestination({
  academyId = DEFAULT_ACADEMY_ID,
  interestType = INTEREST_TYPES.COMBAT,
  language = DEFAULT_LANGUAGE,
  additionalParams = {},
  replace = false
} = {}) {
  const destination = buildAcademyDestination({
    academyId,
    interestType,
    language,
    additionalParams
  });

  if (replace) {
    window.location.replace(destination);
    return;
  }

  window.location.assign(destination);
}

/**
 * Development helper.
 *
 * Example:
 *
 *   logAcademyRoute("yesc", "fitness");
 */
export function logAcademyRoute(
  academyId,
  interestType
) {
  const route = resolveAcademyRoute({
    academyId,
    interestType
  });

  console.table({
    academyId: route.academyId,
    academyName: route.academyName,
    academyModel: route.academyModel,
    interestType: route.interestType,
    provider: route.provider,
    delivery: route.delivery,
    destination: route.destination
  });

  return route;
}