import { db, functions, httpsCallable } from "/assets/js/firebase-init.js";
import { resolveSignedInAthlete } from "/assets/js/athlete-dashboard-data.js";
import { expandScheduleRowsByDay, filterScheduleForAthlete, loadPublishedAthleteSchedule, scheduleCategoryLabel, scheduleProviderLabel } from "/assets/js/location-schedule.js";
import { nextScheduledSession, resolveLocationScheduleLiveState } from "/assets/js/location-schedule-live-state.js";
import { renderMemberCompetitionSplit } from "/assets/js/competition-events.js";


/* SANDMAN-CYCLING-WEEKLY-PRACTICE */

const SANDMAN_WEEKDAY_INDEX = Object.freeze({
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6
});

function sandmanCurrentWeekdayIndex(
  now = new Date(),
  timeZone = "America/Los_Angeles"
) {
  const weekday = new Intl.DateTimeFormat(
    "en-US",
    {
      timeZone,
      weekday: "long"
    }
  )
    .format(now)
    .toLowerCase();

  return SANDMAN_WEEKDAY_INDEX[weekday] ?? now.getDay();
}

function rotateWeeklyRows(
  rows = [],
  now = new Date(),
  timeZone = "America/Los_Angeles"
) {
  const today =
    sandmanCurrentWeekdayIndex(
      now,
      timeZone
    );

  return [...rows]
    .map((row, originalIndex) => {
      const dayName =
        String(row.day || "")
          .trim()
          .toLowerCase();

      const dayIndex =
        SANDMAN_WEEKDAY_INDEX[dayName];

      if (dayIndex == null) {
        return {
          row,
          originalIndex,
          delta: 99
        };
      }

      let delta =
        (dayIndex - today + 7) % 7;

      /*
       * Today's sessions are already displayed
       * in Today's Practice.
       *
       * Put today's weekday at the end of the
       * weekly cycle instead of repeating it first.
       */
      if (delta === 0) {
        delta = 7;
      }

      return {
        row,
        originalIndex,
        delta
      };
    })
    .sort(
      (a, b) =>
        a.delta - b.delta ||
        a.originalIndex - b.originalIndex
    )
    .map((entry) => entry.row);
}

function installWeeklyPracticeAccordion(
  listEl,
  rows = []
) {
  if (!listEl) return;

  let details =
    listEl.closest(
      ".sandman-weekly-accordion"
    );

  if (!details) {
    const panel =
      listEl.closest(
        ".panel, .card, section, article"
      );

    if (!panel) return;

    const heading =
      Array.from(
        panel.querySelectorAll(
          "h2, h3"
        )
      ).find(
        (el) =>
          el.textContent
            .trim()
            .toLowerCase()
            .includes(
              "weekly practice"
            )
      );

    if (!heading) return;

    const possibleSub =
      heading.nextElementSibling;

    const subtitle =
      possibleSub &&
      possibleSub !== listEl &&
      possibleSub.matches(
        "p, .sub, .section-note"
      )
        ? possibleSub
        : null;

    details =
      document.createElement(
        "details"
      );

    details.className =
      "sandman-weekly-accordion";

    const summary =
      document.createElement(
        "summary"
      );

    summary.className =
      "sandman-weekly-summary";

    const copy =
      document.createElement(
        "span"
      );

    copy.className =
      "sandman-weekly-summary__copy";

    const title =
      document.createElement(
        "strong"
      );

    title.textContent =
      "Weekly Practice";

    const next =
      document.createElement(
        "span"
      );

    next.className =
      "sandman-weekly-summary__next";

    copy.append(
      title,
      next
    );

    const chevron =
      document.createElement(
        "span"
      );

    chevron.className =
      "sandman-schedule-chevron";

    chevron.setAttribute(
      "aria-hidden",
      "true"
    );

    chevron.textContent = "⌄";

    summary.append(
      copy,
      chevron
    );

    details.append(summary);

    heading.replaceWith(
      details
    );

    if (subtitle) {
      subtitle.remove();
    }

    details.append(listEl);
  }

  const nextLabel =
    details.querySelector(
      ".sandman-weekly-summary__next"
    );

  const nextDay =
    rows.length
      ? String(
          rows[0].day || ""
        ).trim()
      : "";

  if (nextLabel) {
    nextLabel.textContent =
      nextDay
        ? `Next training day: ${nextDay}`
        : "Standard training rhythm";
  }
}


const todayBox = document.getElementById("today-box");
const dailyEl = document.getElementById("daily-schedule");
const tourEl = document.getElementById("tournament-schedule");
const bannerEl = document.getElementById("coach-banner");
const getAthleteScheduleScopeCall = httpsCallable(functions, "getAthleteScheduleScope");
const listMyCompetitionEventsCall = httpsCallable(functions, "listMyCompetitionEvents");
const competitionUpcomingList = document.getElementById("competition-upcoming-list");
const competitionEventsList = document.getElementById("competition-events-list");
const esc = (value = "") => String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
const displayTime = (row = {}) => row.label || row.time || (row.start && row.end ? `${row.start} - ${row.end}` : "—");
const meta = (row) => `${row.scheduleLocationName ? `${row.scheduleLocationName} • ` : ""}${scheduleCategoryLabel(row)} • ${scheduleProviderLabel(row)} • ${row.instructor || "Instructor TBA"}`;


function athleteAge(athlete = {}) {
  const direct = Number(
    athlete.age ??
    athlete.athleteAge ??
    athlete.currentAge
  );

  if (Number.isFinite(direct) && direct >= 0) {
    return direct;
  }

  const rawDob =
    athlete.dateOfBirth ||
    athlete.dob ||
    athlete.birthDate ||
    "";

  if (!rawDob) return null;

  const dob = new Date(rawDob);
  if (Number.isNaN(dob.getTime())) return null;

  const now = new Date();
  let age = now.getFullYear() - dob.getFullYear();

  const beforeBirthday =
    now.getMonth() < dob.getMonth() ||
    (
      now.getMonth() === dob.getMonth() &&
      now.getDate() < dob.getDate()
    );

  if (beforeBirthday) age -= 1;

  return age >= 0 ? age : null;
}

function scheduleAgeBand(row = {}) {
  const text =
    `${row.title || ""} ${row.details || ""}`
      .toLowerCase();

  if (text.includes("youth")) return "youth";
  if (text.includes("teen")) return "teen";

  return "general";
}

function strictAthleteSchedule(schedule, athlete = {}) {
  const filtered =
    filterScheduleForAthlete(schedule, athlete);

  const age = athleteAge(athlete);

  const athleteId = String(
    athlete.uid ||
    athlete.athleteId ||
    athlete.id ||
    ""
  ).trim().toUpperCase();

  const athleteBand =
    age !== null
      ? (age >= 14 ? "teen" : "youth")
      : athleteId.startsWith("F4_")
        ? "teen"
        : athleteId.startsWith("F8_")
          ? "youth"
          : "general";

  const visible = (row = {}) => {
    const category =
      String(row.category || row.type || "")
        .trim()
        .toLowerCase();

    // Athlete schedule is training-specific.
    if (category === "fitness") {
      return false;
    }

    const band = scheduleAgeBand(row);

    if (athleteBand === "teen" && band === "youth") {
      return false;
    }

    if (athleteBand === "youth" && band === "teen") {
      return false;
    }

    return true;
  };

  return {
    ...filtered,
    weekly: filtered.weekly.filter(visible),
    events: filtered.events.filter(visible),
  };
}

function disciplineIcon(row = {}) {
  const value =
    String(row.discipline || row.title || "")
      .toLowerCase();

  if (
    value.includes("wrestl") ||
    value.includes("grappl")
  ) {
    return "🤼";
  }

  if (value.includes("box")) {
    return "🥊";
  }

  if (
    value.includes("muay") ||
    value.includes("kickbox")
  ) {
    return "🥋";
  }

  if (value.includes("mma")) {
    return "🥋";
  }

  return "⚔️";
}


function combatFamilyClass(row = {}) {
  const value =
    String(
      row.discipline ||
      row.title ||
      row.details ||
      ""
    ).toLowerCase();

  if (
    value.includes("wrestl") ||
    value.includes("grappl") ||
    value.includes("submission")
  ) {
    return "schedule-family--grappling";
  }

  if (
    value.includes("box") ||
    value.includes("muay") ||
    value.includes("kickbox") ||
    value.includes("strik")
  ) {
    return "schedule-family--striking";
  }

  return "";
}

function athleteScheduleClass(row = {}) {
  const band = scheduleAgeBand(row);

  if (band === "youth") return "schedule-age--youth";
  if (band === "teen") return "schedule-age--teen";

  return "schedule-age--general";
}

function athleteScheduleTitle(row = {}) {
  const title = String(row.title || "—");

  const category =
    String(row.category || row.type || "")
      .toLowerCase();

  if (category !== "combat") {
    return esc(title);
  }

  return `${disciplineIcon(row)} ${esc(title)}`;
}

function render(schedule, athlete) {
  const visible = strictAthleteSchedule(schedule, athlete);
  const live = resolveLocationScheduleLiveState(visible.weekly, new Date(), schedule.timezone);
  const later = live.state === "complete" ? nextScheduledSession(visible.weekly, new Date(), schedule.timezone) : null;
  const weeklyRows = rotateWeeklyRows(
    expandScheduleRowsByDay(visible.weekly),
    new Date(),
    schedule.timezone || "America/Los_Angeles"
  );

  if (bannerEl) bannerEl.innerHTML = visible.banner?.active ? `<div class="coach-banner">${esc(visible.banner.text || "")}</div>` : "";
  const stateClass = `schedule-state--${live.state}`;
  const stateTitle = live.state === "active" ? "ACTIVE NOW" : live.state === "next" ? "NEXT SESSION" : live.state === "complete" ? "TODAY COMPLETE" : "NO SESSION TODAY";
  const stateDetail = live.row ? `<div class="item-title">${esc(live.row.title)}</div><div class="item-time">${esc(displayTime(live.row))}</div>${live.state === "next" ? `<div class="item-sub">Starts in ${live.minutesUntil} min</div>` : ""}` : later ? `<div class="item-sub">Next: ${esc(later.row.title)} — ${esc(later.day)} ${esc(displayTime(later.row))}</div>` : `<div class="item-sub">No scheduled session today.</div>`;
  todayBox.className = `today-box ${stateClass}`;
  todayBox.innerHTML = `<div class="item"><div class="item-day">${stateTitle}</div>${stateDetail}</div>${live.todayRows.map((row) => `<div class="item schedule-category--${esc(row.category || "unknown")} schedule-provider--${esc(row.provider || "unknown")} ${athleteScheduleClass(row)} ${combatFamilyClass(row)}"><div class="item-top"><div class="item-day">${athleteScheduleTitle(row)}</div><div class="item-time">${esc(displayTime(row))}</div></div><div class="item-sub">${esc(row.details || "")}</div><div class="item-sub">${esc(meta(row))}</div></div>`).join("")}`;
  dailyEl.innerHTML = weeklyRows.length ? weeklyRows.map((row) => `<div class="item schedule-category--${esc(row.category || "unknown")} schedule-provider--${esc(row.provider || "unknown")} ${athleteScheduleClass(row)} ${combatFamilyClass(row)}"><div class="item-top"><div class="item-day">${esc(row.day || "—")}</div><div class="item-time">${esc(displayTime(row))}</div></div><div class="item-title">${athleteScheduleTitle(row)}</div><div class="item-sub">${esc(row.details || "")}</div><div class="item-sub">${esc(meta(row))}</div></div>`).join("") : `<div class="item"><div class="item-sub">No weekly schedule published for this location.</div></div>`;
  installWeeklyPracticeAccordion(dailyEl, weeklyRows);
  tourEl.innerHTML = visible.events.length ? visible.events.map((event) => `<div class="item"><div class="item-top"><div class="item-day">${esc(event.title || "—")}</div><div class="item-time">${esc(event.date || "—")}</div></div><div class="item-sub">${esc(event.location || "")}</div><div class="item-sub">${esc(event.details || "")}</div></div>`).join("") : `<div class="item"><div class="item-sub">No upcoming events published.</div></div>`;
}

async function start() {
  const requestedId = new URLSearchParams(location.search).get("id") || "";
  const context = await resolveSignedInAthlete(requestedId);
  if (!context?.athleteId || !context?.athlete) throw new Error("Athlete access required.");
  const scope = await getAthleteScheduleScopeCall({ athleteId: context.athleteId });
  render(await loadPublishedAthleteSchedule(db, { id: context.athleteId, ...context.athlete }, scope.data?.assignments || []), context.athlete);
  try { const competitionResult = await listMyCompetitionEventsCall({ athleteId:context.athleteId }); renderMemberCompetitionSplit(
      competitionUpcomingList,
      competitionEventsList,
      competitionResult.data?.events || [],
      esc,
      { legacyUpcomingContainer: tourEl }
    ); }
  catch (error) { console.error("[athlete-competition-schedule] load failed", error); competitionEventsList.innerHTML = '<p class="sub">Competition schedule is temporarily unavailable.</p>'; }
}

start().catch((error) => {
  console.error("[athlete-schedule] load failed", error);
  todayBox.innerHTML = `<div class="item"><div class="item-sub">${esc(error.message || "Schedule unavailable.")}</div></div>`;
  dailyEl.innerHTML = "";
  tourEl.innerHTML = "";
});
