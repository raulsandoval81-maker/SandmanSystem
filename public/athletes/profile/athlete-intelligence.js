
import { functions, httpsCallable } from "/assets/js/firebase-init.js";

const getSkillsSummary = httpsCallable(functions, "getAthleteSkillsSummary");
const listCompetitionEvents = httpsCallable(functions, "listMyCompetitionEvents");
const getProfileFeed = httpsCallable(functions, "getAthleteProfileFeed");

const DISCIPLINES = ["wrestling", "boxing", "muay-thai"];
const STATES = ["LEARNED", "APPLIED", "MASTERED", "REFINED"];

const clean = (v) => String(v ?? "").trim();
const esc = (v = "") => String(v)
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#39;");

function athleteIdFromUrl() {
  const params = new URLSearchParams(window.location.search);
  return clean(
    params.get("id") ||
    params.get("uid") ||
    params.get("athleteId")
  ).toUpperCase();
}

function label(value = "") {
  return clean(value)
    .replaceAll("-", " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function countsFor(skills = []) {
  const counts = Object.fromEntries(
    STATES.map((state) => [state, 0])
  );

  for (const skill of skills) {
    const state = clean(skill?.state).toUpperCase();
    if (state in counts) counts[state] += 1;
  }

  return counts;
}

function total(counts = {}) {
  return STATES.reduce(
    (sum, state) => sum + Number(counts[state] || 0),
    0
  );
}

async function loadSkills(athleteId) {
  return Promise.all(
    DISCIPLINES.map(async (discipline) => {
      try {
        const response = await getSkillsSummary({
          athleteId,
          discipline
        });

        const skills = Array.isArray(response.data?.skills)
          ? response.data.skills
          : [];

        return {
          discipline,
          available: true,
          skills,
          counts: countsFor(skills)
        };
      } catch (error) {
        return {
          discipline,
          available: false,
          skills: [],
          counts: countsFor([]),
          error: error?.message || "Unavailable"
        };
      }
    })
  );
}

async function loadCompetition(athleteId) {
  try {
    const response = await listCompetitionEvents({
      athleteId
    });

    return {
      available: true,
      events: Array.isArray(response.data?.events)
        ? response.data.events
        : []
    };
  } catch (error) {
    return {
      available: false,
      events: [],
      error: error?.message || "Unavailable"
    };
  }
}

async function loadActivity(athleteId) {
  try {
    const response = await getProfileFeed({
      athleteId
    });

    return {
      available: true,
      activity: Array.isArray(response.data?.activity)
        ? response.data.activity
        : [],
      achievements: Array.isArray(response.data?.achievements)
        ? response.data.achievements
        : []
    };
  } catch (error) {
    return {
      available: false,
      activity: [],
      achievements: [],
      error: error?.message || "Unavailable"
    };
  }
}

function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value);

  return Number.isFinite(date.getTime())
    ? date.toLocaleDateString()
    : clean(value);
}

function makeSection() {
  const section = document.createElement("section");
  section.id = "athleteIntelligence";
  section.className = "card athlete-intelligence";
  section.innerHTML =
    '<div class="athlete-intelligence__head">' +
      '<div>' +
        '<span class="athlete-intel-eyebrow">Athlete Profile</span>' +
        '<h2>Athlete Intelligence</h2>' +
        '<p>One read-only view of development, competition, performance signals, and connected athlete data.</p>' +
      '</div>' +
      '<span class="athlete-intelligence__badge">Live Profile</span>' +
    '</div>' +

    '<div class="athlete-intel-summary">' +
      '<article><span>Skills</span><strong id="athleteIntelSkillHeadline">Loading…</strong></article>' +
      '<article><span>Competition</span><strong id="athleteIntelCompetitionHeadline">Loading…</strong></article>' +
      '<article><span>Activity</span><strong id="athleteIntelActivityHeadline">Loading…</strong></article>' +
    '</div>' +

    '<details class="athlete-intel-panel" open>' +
      '<summary><strong>Development</strong><span>Verified Skills</span></summary>' +
      '<div id="athleteIntelSkills" class="athlete-intel-panel__body"><p class="muted">Loading skill development…</p></div>' +
    '</details>' +

    '<details class="athlete-intel-panel">' +
      '<summary><strong>Competition</strong><span>Upcoming</span></summary>' +
      '<div id="athleteIntelCompetition" class="athlete-intel-panel__body"><p class="muted">Loading competition schedule…</p></div>' +
    '</details>' +

    '<details class="athlete-intel-panel">' +
      '<summary><strong>Stats &amp; Activity</strong><span>Recent signals</span></summary>' +
      '<div id="athleteIntelStats" class="athlete-intel-stats athlete-intel-panel__body"></div>' +
    '</details>' +

    '<details class="athlete-intel-panel">' +
      '<summary><strong>Performance Intelligence</strong><span>Cornerman AI</span></summary>' +
      '<div class="athlete-intel-panel__body">' +
        '<div class="athlete-intel-cornerman">' +
          '<div><span class="athlete-intel-eyebrow">Cornerman AI</span><strong>Performance Intelligence</strong></div>' +
          '<p>Cornerman match analysis is not yet connected to a canonical athlete match-history feed. When match records are linked, this area can surface evidence-based patterns, coach summaries, and practice focus without changing official Skills, XP, or competition records.</p>' +
          '<span class="athlete-intel-status">Awaiting canonical match data</span>' +
        '</div>' +
      '</div>' +
    '</details>' +

    '<p class="athlete-intel-governance">This profile summarizes authoritative systems. Skill verification, competition publishing, XP, assessment, and progression remain controlled by their owning workflows.</p>';

  return section;
}

function mount() {
  if (document.getElementById("athleteIntelligence")) return;

  const anchor =
    document.getElementById("skillsLane") ||
    document.getElementById("achievementLane") ||
    document.querySelector("main.wrap section");

  if (anchor?.parentNode) {
    anchor.parentNode.insertBefore(
      makeSection(),
      anchor
    );
  }
}

function renderSkills(data = []) {
  const target = document.getElementById("athleteIntelSkills");
  if (!target) return;

  const active = data.filter(
    (item) =>
      item.available &&
      total(item.counts) > 0
  );

  if (!active.length) {
    target.innerHTML =
      '<p class="athlete-intel-empty">No verified skill-development data is available yet.</p>';
    return;
  }

  target.innerHTML = active.map((item) => {
    const cells = STATES.map((state) =>
      '<div><span>' +
      esc(label(state)) +
      '</span><strong>' +
      esc(item.counts[state] || 0) +
      '</strong></div>'
    ).join("");

    return (
      '<article class="athlete-intel-skill">' +
        '<div class="athlete-intel-skill__head">' +
          '<strong>' + esc(label(item.discipline)) + '</strong>' +
          '<span>' + esc(total(item.counts)) + ' tracked</span>' +
        '</div>' +
        '<div class="athlete-intel-state-grid">' + cells + '</div>' +
      '</article>'
    );
  }).join("");
}

function renderCompetition(data = {}) {
  const target = document.getElementById("athleteIntelCompetition");
  if (!target) return;

  if (!data.available) {
    target.innerHTML =
      '<p class="athlete-intel-empty">Competition schedule is not available for this viewer.</p>';
    return;
  }

  if (!data.events.length) {
    target.innerHTML =
      '<p class="athlete-intel-empty">No published competitions are currently assigned to this athlete.</p>';
    return;
  }

  target.innerHTML = data.events
    .slice(0, 3)
    .map((event, index) => {
      const name =
        clean(event.name || event.title) ||
        "Competition";

      const discipline = clean(
        event.disciplineId ||
        event.programScopes?.[0]
      );

      return (
        '<article class="athlete-intel-event">' +
          '<span class="athlete-intel-event__index">' +
            esc(index + 1) +
          '</span>' +
          '<div>' +
            '<strong>' + esc(name) + '</strong>' +
            '<p>' +
              esc(formatDate(event.startDate)) +
              (discipline
                ? ' · ' + esc(label(discipline))
                : '') +
            '</p>' +
          '</div>' +
        '</article>'
      );
    })
    .join("");
}

function renderStats(activityData, skillsData, competition) {
  const target = document.getElementById("athleteIntelStats");
  if (!target) return;

  const activity = activityData.activity || [];
  const achievements = activityData.achievements || [];

  const tracked = skillsData.reduce(
    (sum, item) =>
      sum + total(item.counts),
    0
  );

  const advanced = skillsData.reduce(
    (sum, item) =>
      sum +
      Number(item.counts?.MASTERED || 0) +
      Number(item.counts?.REFINED || 0),
    0
  );

  const recentXp = activity.reduce(
    (sum, item) =>
      sum + Number(item?.amount || 0),
    0
  );

  const upcoming =
    competition.available
      ? competition.events.length
      : 0;

  const stats = [
    ["Recent XP", recentXp > 0 ? "+" + recentXp : String(recentXp)],
    ["Tracked Skills", tracked],
    ["Mastered / Refined", advanced],
    ["Upcoming Events", upcoming],
    ["Recent Achievements", achievements.length],
    ["Recent Activity", activity.length]
  ];

  target.innerHTML = stats.map(([name, value]) =>
    '<div class="athlete-intel-stat">' +
      '<span>' + esc(name) + '</span>' +
      '<strong>' + esc(value) + '</strong>' +
    '</div>'
  ).join("");
}

async function render() {
  const athleteId = athleteIdFromUrl();
  if (!athleteId) return;

  mount();

  const [
    skills,
    competition,
    activity
  ] = await Promise.all([
    loadSkills(athleteId),
    loadCompetition(athleteId),
    loadActivity(athleteId)
  ]);

  renderSkills(skills);
  renderCompetition(competition);
  renderStats(
    activity,
    skills,
    competition
  );

  const tracked = skills.reduce(
    (sum, item) =>
      sum + total(item.counts),
    0
  );

  const advanced = skills.reduce(
    (sum, item) =>
      sum +
      Number(item.counts?.MASTERED || 0) +
      Number(item.counts?.REFINED || 0),
    0
  );

  const skillsHeadline =
    document.getElementById(
      "athleteIntelSkillHeadline"
    );

  const competitionHeadline =
    document.getElementById(
      "athleteIntelCompetitionHeadline"
    );

  const activityHeadline =
    document.getElementById(
      "athleteIntelActivityHeadline"
    );

  if (skillsHeadline) {
    skillsHeadline.textContent =
      tracked
        ? advanced +
          " advanced · " +
          tracked +
          " tracked"
        : "No verified skills yet";
  }

  if (competitionHeadline) {
    competitionHeadline.textContent =
      competition.available
        ? competition.events.length
          ? competition.events.length +
            " upcoming"
          : "No upcoming events"
        : "Unavailable";
  }

  if (activityHeadline) {
    const count =
      activity.activity?.length || 0;

    activityHeadline.textContent =
      count
        ? count + " recent entries"
        : "No recent activity";
  }
}

void render();
