
import {
  db,
  doc,
  getDoc,
  functions,
  httpsCallable
} from "/assets/js/firebase-init.js";

import {
  coachLoginUrl,
  requireCoach
} from "/assets/js/coach-guard.js";

const getSkillsSummary =
  httpsCallable(functions, "getAthleteSkillsSummary");

const listCompetitionEvents =
  httpsCallable(functions, "listCompetitionEvents");

const getAthleteProfileFeed =
  httpsCallable(functions, "getAthleteProfileFeed");

const DISCIPLINES = [
  "wrestling",
  "boxing",
  "muay-thai"
];

const SKILL_STATES = [
  "LEARNED",
  "APPLIED",
  "MASTERED",
  "REFINED"
];

const $ = (id) =>
  document.getElementById(id);

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

function athleteIdFromUrl() {
  const params =
    new URLSearchParams(
      window.location.search
    );

  return clean(
    params.get("id") ||
    params.get("uid") ||
    params.get("athleteId")
  ).toUpperCase();
}

function normalizeDiscipline(value = "") {
  const raw =
    clean(value).toLowerCase();

  if (raw.includes("wrest")) {
    return "wrestling";
  }

  if (
    raw.includes("muay") ||
    raw.includes("kickbox")
  ) {
    return "muay-thai";
  }

  if (raw.includes("box")) {
    return "boxing";
  }

  if (raw.includes("mma")) {
    return "mma";
  }

  if (
    raw.includes("submission") ||
    raw.includes("grappling")
  ) {
    return "submission-grappling";
  }

  return raw
    .replace(/[\s_]+/g, "-");
}

function label(value = "") {
  return clean(value)
    .replaceAll("-", " ")
    .replace(/\b\w/g, (char) =>
      char.toUpperCase()
    );
}

function list(value) {
  return Array.isArray(value)
    ? value.map(clean).filter(Boolean)
    : [];
}

function athleteDisciplineIds(
  athlete = {}
) {
  return Array.from(
    new Set(
      [
        ...list(athlete.disciplineIds),
        ...Object.keys(
          athlete.disciplines || {}
        ),
        athlete.activeDiscipline,
        athlete.primaryDiscipline,
        athlete.discipline,
        athlete.art,
        athlete.sport
      ]
        .map(normalizeDiscipline)
        .filter(Boolean)
    )
  );
}

function athleteTeamIds(
  athlete = {}
) {
  return new Set(
    [
      ...list(athlete.teamIds),
      ...list(athlete.teams),
      clean(athlete.teamId)
    ].filter(Boolean)
  );
}

function athleteLocationIds(
  athlete = {}
) {
  return new Set(
    [
      clean(athlete.locationId),
      clean(
        athlete.location?.locationId
      ),
      clean(athlete.location?.id)
    ].filter(Boolean)
  );
}

function eventMatchesAthlete(
  event = {},
  athlete = {}
) {
  if (
    event.publicationStatus &&
    clean(event.publicationStatus)
      .toLowerCase() !== "published"
  ) {
    return false;
  }

  if (
    event.status &&
    clean(event.status)
      .toLowerCase() !== "active"
  ) {
    return false;
  }

  const athleteDisciplines =
    new Set(
      athleteDisciplineIds(athlete)
    );

  const eventDisciplines =
    new Set(
      [
        normalizeDiscipline(
          event.disciplineId
        ),
        ...list(event.programScopes)
          .map(normalizeDiscipline)
      ].filter(Boolean)
    );

  if (
    eventDisciplines.size &&
    ![...eventDisciplines]
      .some((id) =>
        athleteDisciplines.has(id)
      )
  ) {
    return false;
  }

  const eventLocations =
    list(event.locationIds);

  const athleteLocations =
    athleteLocationIds(athlete);

  if (
    eventLocations.length &&
    !eventLocations.some((id) =>
      athleteLocations.has(id)
    )
  ) {
    return false;
  }

  const eventTeams =
    list(event.teamIds);

  const athleteTeams =
    athleteTeamIds(athlete);

  if (
    eventTeams.length &&
    !eventTeams.some((id) =>
      athleteTeams.has(id)
    )
  ) {
    return false;
  }

  return true;
}

function formatDate(value) {
  if (!value) return "—";

  const date =
    new Date(value);

  return Number.isFinite(
    date.getTime()
  )
    ? date.toLocaleDateString(
        undefined,
        {
          month: "short",
          day: "numeric",
          year: "numeric"
        }
      )
    : clean(value);
}

function daysUntil(value) {
  if (!value) return null;

  const date =
    new Date(
      String(value).includes("T")
        ? value
        : value + "T12:00:00"
    );

  if (
    !Number.isFinite(
      date.getTime()
    )
  ) {
    return null;
  }

  return Math.ceil(
    (
      date.getTime() -
      Date.now()
    ) / 86400000
  );
}

function rankInfo(
  athlete = {}
) {
  const discipline =
    normalizeDiscipline(
      athlete.activeDiscipline ||
      athlete.primaryDiscipline ||
      athlete.discipline ||
      athlete.art
    );

  const combat =
    athlete.disciplines?.[
      discipline
    ] ||
    (
      discipline === "muay-thai"
        ? athlete.disciplines?.kickboxing
        : null
    ) ||
    athlete;

  return {
    discipline,
    rank:
      clean(
        combat.rankName ||
        combat.tierName ||
        athlete.rankName ||
        athlete.tierName
      ) || "—",
    tier:
      clean(
        combat.tier ??
        combat.progressionTier ??
        athlete.tier ??
        athlete.progressionTier
      ),
    xp:
      Number(
        combat.xp ??
        combat.currentTierXP ??
        athlete.xp ??
        athlete.currentTierXP ??
        0
      )
  };
}

function skillCounts(
  skills = []
) {
  const counts =
    Object.fromEntries(
      SKILL_STATES.map(
        (state) => [state, 0]
      )
    );

  for (const skill of skills) {
    const state =
      clean(
        skill.state
      ).toUpperCase();

    if (state in counts) {
      counts[state] += 1;
    }
  }

  return counts;
}

function skillTotal(
  counts = {}
) {
  return SKILL_STATES.reduce(
    (sum, state) =>
      sum +
      Number(
        counts[state] || 0
      ),
    0
  );
}

async function loadSkills(
  athleteId
) {
  return Promise.all(
    DISCIPLINES.map(
      async (discipline) => {
        try {
          const response =
            await getSkillsSummary({
              athleteId,
              discipline
            });

          const skills =
            Array.isArray(
              response.data?.skills
            )
              ? response.data.skills
              : [];

          return {
            discipline,
            available: true,
            skills,
            counts:
              skillCounts(skills)
          };
        } catch (error) {
          return {
            discipline,
            available: false,
            skills: [],
            counts:
              skillCounts([]),
            error:
              error?.message ||
              "Unavailable"
          };
        }
      }
    )
  );
}

async function loadCompetition(
  athlete
) {
  try {
    const response =
      await listCompetitionEvents({});

    const events =
      (
        Array.isArray(
          response.data?.events
        )
          ? response.data.events
          : []
      )
        .filter((event) =>
          eventMatchesAthlete(
            event,
            athlete
          )
        )
        .filter((event) => {
          const days =
            daysUntil(
              event.startDate
            );

          return (
            days === null ||
            days >= 0
          );
        })
        .sort((a, b) =>
          clean(a.startDate)
            .localeCompare(
              clean(b.startDate)
            )
        );

    return {
      available: true,
      events
    };
  } catch (error) {
    return {
      available: false,
      events: [],
      error:
        error?.message ||
        "Unavailable"
    };
  }
}

async function loadProfileFeed(
  athleteId
) {
  try {
    const response =
      await getAthleteProfileFeed({
        athleteId
      });

    return {
      available: true,
      activity:
        Array.isArray(
          response.data?.activity
        )
          ? response.data.activity
          : [],
      achievements:
        Array.isArray(
          response.data
            ?.achievements
        )
          ? response.data
              .achievements
          : []
    };
  } catch (error) {
    return {
      available: false,
      activity: [],
      achievements: [],
      error:
        error?.message ||
        "Unavailable"
    };
  }
}

function profileUrl(
  athleteId,
  athlete = {}
) {
  const journey =
    clean(
      athlete.journey ||
      athlete.programTrack ||
      athlete.program ||
      athlete.track
    ).toLowerCase();

  const profileType =
    clean(
      athlete.profileType
    ).toLowerCase();

  const art =
    normalizeDiscipline(
      athlete.art ||
      athlete.primaryDiscipline ||
      athlete.discipline
    );

  if (
    profileType === "mini" ||
    athleteId.startsWith("F8_") ||
    journey.includes(
      "road2champion"
    ) ||
    journey === "r2c"
  ) {
    return (
      "/athletes/profile/mini-profile.html?id=" +
      encodeURIComponent(
        athleteId
      )
    );
  }

  if (
    profileType === "adult" ||
    journey.includes(
      "quest2mastery"
    ) ||
    journey.includes("q2m") ||
    art === "mma"
  ) {
    return (
      "/athletes/profile/adult-profile.html?id=" +
      encodeURIComponent(
        athleteId
      )
    );
  }

  return (
    "/athletes/profile/athlete-profile.html?id=" +
    encodeURIComponent(
      athleteId
    )
  );
}

function setActionLinks(
  athleteId,
  athlete
) {
  const params =
    "?id=" +
    encodeURIComponent(
      athleteId
    );

  const skillDiscipline =
    normalizeDiscipline(
      athlete.activeDiscipline ||
      athlete.primaryDiscipline ||
      athlete.discipline ||
      athlete.art ||
      "wrestling"
    );

  const skillLink =
    $("skillCheckLink");

  if (skillLink) {
    skillLink.href =
      "/coaches/skill-check/" +
      params +
      "&discipline=" +
      encodeURIComponent(
        skillDiscipline
      );
  }

  const routes = {
    progressionLink:
      "/coaches/progression/",
    testingLink:
      "/coaches/testing/",
    recognitionLink:
      "/coaches/recognition/"
  };

  Object.entries(
    routes
  ).forEach(
    ([id, route]) => {
      const link = $(id);

      if (link) {
        link.href =
          route + params;
      }
    }
  );

  const athleteView =
    $("athleteViewLink");

  if (athleteView) {
    athleteView.href =
      profileUrl(
        athleteId,
        athlete
      );
  }
}

function renderIdentity(
  athleteId,
  athlete
) {
  const info =
    rankInfo(athlete);

  const name =
    clean(
      athlete.publicName ||
      athlete.fullName ||
      athlete.name
    ) ||
    athleteId;

  const journey =
    clean(
      athlete.journey ||
      athlete.program ||
      athlete.track ||
      athlete.trackCode
    );

  const disciplines =
    athleteDisciplineIds(
      athlete
    )
      .map(label)
      .join(" · ");

  $("athleteName").textContent =
    name;

  $("athleteId").textContent =
    athleteId;

  $("athleteStatus").textContent =
    label(
      athlete.rosterStatus ||
      athlete.status ||
      "current"
    );

  $("athleteMeta").textContent =
    [
      journey
        ? label(journey)
        : "",
      disciplines
    ]
      .filter(Boolean)
      .join(" · ") ||
    "Athlete";

  $("metricRank").textContent =
    info.rank;

  $("metricRankMeta").textContent =
    [
      info.tier
        ? "Tier " + info.tier
        : "",
      info.discipline
        ? label(
            info.discipline
          )
        : ""
    ]
      .filter(Boolean)
      .join(" · ") ||
    "Current progression";

  $("metricXp").textContent =
    String(info.xp);
}

function renderSkills(
  data = []
) {
  const target =
    $("skillsSummary");

  if (!target) return;

  const active =
    data.filter(
      (item) =>
        item.available &&
        skillTotal(
          item.counts
        ) > 0
    );

  if (!active.length) {
    target.innerHTML =
      '<p class="muted">No verified skill-development data is recorded yet.</p>';
    return;
  }

  target.innerHTML =
    active.map((item) => {
      const cells =
        SKILL_STATES.map(
          (state) =>
            '<div>' +
              '<span>' +
                esc(label(state)) +
              '</span>' +
              '<strong>' +
                esc(
                  item.counts[
                    state
                  ] || 0
                ) +
              '</strong>' +
            '</div>'
        ).join("");

      return (
        '<article class="skill-discipline">' +
          '<div class="skill-discipline__head">' +
            '<strong>' +
              esc(
                label(
                  item.discipline
                )
              ) +
            '</strong>' +
            '<span>' +
              esc(
                skillTotal(
                  item.counts
                )
              ) +
              ' verified</span>' +
          '</div>' +
          '<div class="skill-state-grid">' +
            cells +
          '</div>' +
        '</article>'
      );
    }).join("");
}

function renderCompetition(
  competition
) {
  const target =
    $("competitionList");

  if (!target) return;

  if (!competition.available) {
    target.innerHTML =
      '<p class="muted">Competition data is unavailable.</p>';
    return;
  }

  if (!competition.events.length) {
    target.innerHTML =
      '<p class="muted">No published upcoming competitions match this athlete\'s current scope.</p>';
    return;
  }

  target.innerHTML =
    competition.events
      .slice(0, 5)
      .map((event) => {
        const discipline =
          normalizeDiscipline(
            event.disciplineId ||
            event.programScopes?.[0]
          );

        const days =
          daysUntil(
            event.startDate
          );

        const countdown =
          days === null
            ? ""
            : days === 0
              ? "Today"
              : days === 1
                ? "Tomorrow"
                : days +
                  " days";

        return (
          '<article class="competition-item">' +
            '<strong>' +
              esc(
                event.name ||
                event.title ||
                "Competition"
              ) +
            '</strong>' +
            '<p>' +
              esc(
                formatDate(
                  event.startDate
                )
              ) +
              (
                discipline
                  ? " · " +
                    esc(
                      label(
                        discipline
                      )
                    )
                  : ""
              ) +
              (
                countdown
                  ? " · " +
                    esc(countdown)
                  : ""
              ) +
            '</p>' +
          '</article>'
        );
      })
      .join("");
}

function renderFeed(
  targetId,
  items,
  type
) {
  const target =
    $(targetId);

  if (!target) return;

  if (!items.length) {
    target.innerHTML =
      '<p class="muted">No recent records.</p>';
    return;
  }

  target.innerHTML =
    items
      .slice(0, 5)
      .map((item) => {
        const title =
          type === "activity"
            ? (
                (
                  Number(
                    item.amount ||
                    0
                  ) > 0
                    ? "+"
                    : ""
                ) +
                Number(
                  item.amount ||
                  0
                ) +
                " XP"
              )
            : (
                item.label ||
                item.title ||
                "Achievement"
              );

        const detail =
          type === "activity"
            ? (
                item.label ||
                item.note ||
                item.kind ||
                "Activity"
              )
            : (
                item.message ||
                item.note ||
                item.title ||
                ""
              );

        return (
          '<article class="feed-item">' +
            '<strong>' +
              esc(title) +
            '</strong>' +
            '<p>' +
              esc(detail) +
              (
                item.createdAt
                  ? " · " +
                    esc(
                      formatDate(
                        item.createdAt
                      )
                    )
                  : ""
              ) +
            '</p>' +
          '</article>'
        );
      })
      .join("");
}

function renderMetrics(
  skills,
  competition,
  feed
) {
  const tracked =
    skills.reduce(
      (sum, item) =>
        sum +
        skillTotal(
          item.counts
        ),
      0
    );

  const advanced =
    skills.reduce(
      (sum, item) =>
        sum +
        Number(
          item.counts
            ?.MASTERED ||
          0
        ) +
        Number(
          item.counts
            ?.REFINED ||
          0
        ),
      0
    );

  $("metricSkills").textContent =
    String(tracked);

  $("metricSkillsMeta").textContent =
    advanced +
    " mastered / refined";

  if (
    competition.available &&
    competition.events.length
  ) {
    const next =
      competition.events[0];

    $("metricCompetition")
      .textContent =
        formatDate(
          next.startDate
        );

    $("metricCompetitionMeta")
      .textContent =
        clean(
          next.name ||
          next.title
        ) ||
        "Next published event";
  } else {
    $("metricCompetition")
      .textContent = "None";

    $("metricCompetitionMeta")
      .textContent =
        competition.available
          ? "No matching published events"
          : "Competition unavailable";
  }

  $("metricActivity")
    .textContent =
      String(
        feed.activity.length
      );

  $("metricAchievements")
    .textContent =
      String(
        feed.achievements.length
      );
}

function renderAttention(
  skills,
  competition,
  feed
) {
  const items = [];

  const tracked =
    skills.reduce(
      (sum, item) =>
        sum +
        skillTotal(
          item.counts
        ),
      0
    );

  if (tracked === 0) {
    items.push(
      "No verified skills are recorded yet. Use Skill Check when technical evidence is ready."
    );
  }

  const next =
    competition.events?.[0];

  const days =
    daysUntil(
      next?.startDate
    );

  if (
    next &&
    days !== null &&
    days >= 0 &&
    days <= 14
  ) {
    items.push(
      (
        next.name ||
        next.title ||
        "Competition"
      ) +
      (
        days === 0
          ? " is today."
          : " is in " +
            days +
            " day" +
            (
              days === 1
                ? "."
                : "s."
            )
      )
    );
  }

  if (
    feed.available &&
    feed.activity.length === 0
  ) {
    items.push(
      "No recent XP activity appears in the current activity feed."
    );
  }

  const target =
    $("attentionList");

  if (!target) return;

  if (!items.length) {
    target.innerHTML =
      '<p class="muted">No immediate Coach attention signals from the connected data.</p>';
    return;
  }

  target.innerHTML =
    items
      .map((item) =>
        '<div class="attention-item">' +
          '<span class="attention-dot" aria-hidden="true"></span>' +
          '<span>' +
            esc(item) +
          '</span>' +
        '</div>'
      )
      .join("");
}

async function initialize() {
  const athleteId =
    athleteIdFromUrl();

  const status =
    $("athleteTrackStatus");

  const protectedContent =
    document.querySelector(
      "[data-athlete-track-protected]"
    );

  try {
    await requireCoach();

    if (!athleteId) {
      throw new Error(
        "Choose an athlete from Team Roster."
      );
    }

    const snap =
      await getDoc(
        doc(
          db,
          "athletes",
          athleteId
        )
      );

    if (!snap.exists()) {
      throw new Error(
        "Athlete not found."
      );
    }

    const athlete =
      snap.data() || {};

    renderIdentity(
      athleteId,
      athlete
    );

    setActionLinks(
      athleteId,
      athlete
    );

    const [
      skills,
      competition,
      feed
    ] = await Promise.all([
      loadSkills(
        athleteId
      ),
      loadCompetition(
        athlete
      ),
      loadProfileFeed(
        athleteId
      )
    ]);

    renderSkills(skills);
    renderCompetition(
      competition
    );

    renderFeed(
      "activityList",
      feed.activity,
      "activity"
    );

    renderFeed(
      "achievementList",
      feed.achievements,
      "achievement"
    );

    renderMetrics(
      skills,
      competition,
      feed
    );

    renderAttention(
      skills,
      competition,
      feed
    );

    if (protectedContent) {
      protectedContent.hidden =
        false;
    }

    if (status) {
      status.hidden =
        true;
    }
  } catch (error) {
    console.error(
      "[athlete-tracking] failed",
      error
    );

    if (protectedContent) {
      protectedContent.hidden =
        true;
    }

    if (status) {
      status.hidden = false;
      status.classList.add(
        "is-error"
      );

      status.replaceChildren();

      const message =
        document.createElement(
          "span"
        );

      message.textContent =
        (
          error?.message ||
          "Coach access is required."
        ) + " ";

      status.appendChild(
        message
      );

      if (
        String(
          error?.message || ""
        )
          .toLowerCase()
          .includes("coach")
      ) {
        const link =
          document.createElement(
            "a"
          );

        link.href =
          coachLoginUrl();

        link.textContent =
          "Sign in as Coach";

        status.appendChild(
          link
        );
      } else {
        const link =
          document.createElement(
            "a"
          );

        link.href =
          "/coaches/roster/";

        link.textContent =
          "Open Team Roster";

        status.appendChild(
          link
        );
      }
    }
  }
}

void initialize();
