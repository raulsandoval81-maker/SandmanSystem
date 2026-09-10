import { auth, db, functions, doc, getDoc, httpsCallable } from "/assets/js/firebase-init-para.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.13.1/firebase-auth.js";
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


const bannerPanel = document.getElementById("banner-card");
const bannerText = document.getElementById("banner-text");
const todayCard = document.getElementById("today-box");
const weeklyList = document.getElementById("weekly-list");
const eventsList = document.getElementById("events-list");
const lastUpdated = document.getElementById("last-updated");
const getMyAthleteCall = httpsCallable(functions, "getMyAthlete");
const getAthleteScheduleScopeCall = httpsCallable(functions, "getAthleteScheduleScope");
const listMyCompetitionEventsCall = httpsCallable(functions, "listMyCompetitionEvents");
const competitionUpcomingList = document.getElementById("competition-upcoming-list");
const competitionEventsList = document.getElementById("competition-events-list");
const esc = (value = "") => String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
const displayTime = (row = {}) => row.label || row.time || (row.start && row.end ? `${row.start} - ${row.end}` : "—");
const meta = (row) => `${row.scheduleLocationName ? `${row.scheduleLocationName} • ` : ""}${scheduleCategoryLabel(row)} • ${scheduleProviderLabel(row)} • ${row.instructor || "Instructor TBA"}`;


const disciplineIcon = (row = {}) => {
  const discipline = String(
    row.discipline || row.title || ""
  ).toLowerCase();

  if (discipline.includes("wrestl") || discipline.includes("grappl")) {
    return "🤼";
  }

  if (discipline.includes("box")) {
    return "🥊";
  }

  if (
    discipline.includes("muay") ||
    discipline.includes("kickbox")
  ) {
    return "🥋";
  }

  if (discipline.includes("mma")) {
    return "🥋";
  }

  return "⚔️";
};

const scheduleAgeBand = (row = {}) => {
  const text =
    `${row.title || ""} ${row.details || ""}`.toLowerCase();

  if (text.includes("youth")) return "schedule-age--youth";
  if (text.includes("teen")) return "schedule-age--teen";

  return "schedule-age--general";
};

const scheduleTitle = (row = {}) => {
  const title = String(row.title || "—");
  const category =
    String(row.category || row.type || "").toLowerCase();

  if (category !== "combat") {
    return esc(title);
  }

  return `${disciplineIcon(row)} ${esc(title)}`;
};

function render(schedule, athlete) {
  const visible = filterScheduleForAthlete(schedule, athlete);
  const live = resolveLocationScheduleLiveState(visible.weekly, new Date(), schedule.timezone);
  const later = live.state === "complete" ? nextScheduledSession(visible.weekly, new Date(), schedule.timezone) : null;
  const weeklyRows = rotateWeeklyRows(
    expandScheduleRowsByDay(visible.weekly),
    new Date(),
    schedule.timezone || "America/Los_Angeles"
  );

  if (bannerPanel && bannerText) {
    const show = visible.banner?.active === true && String(visible.banner?.text || "").trim();
    bannerPanel.style.display = show ? "" : "none";
    bannerText.textContent = show ? visible.banner.text : "";
  }

  const stateClass = `schedule-state--${live.state}`;
  const stateTitle = live.state === "active" ? "ACTIVE NOW" : live.state === "next" ? "NEXT PRACTICE" : live.state === "complete" ? "TODAY COMPLETE" : "NO PRACTICE TODAY";
  const stateDetail = live.row ? `<strong>${esc(live.row.title)}</strong><br>${esc(displayTime(live.row))}${live.state === "next" ? `<br>Starts in ${live.minutesUntil} min` : ""}` : later ? `Next: ${esc(later.row.title)} — ${esc(later.day)} ${esc(displayTime(later.row))}` : "No scheduled session today.";
  todayCard.className = `today-box ${stateClass}`;
  todayCard.innerHTML = `<div class="status-row"><div class="k">${stateTitle}</div><div class="v">${stateDetail}</div></div>${live.todayRows.length ? `<div class="weekly-list">${live.todayRows.map((row) => `<div class="item schedule-category--${esc(row.category || "unknown")} schedule-provider--${esc(row.provider || "unknown")} ${scheduleAgeBand(row)}"><div class="item-top"><div class="item-day">${scheduleTitle(row)}</div><div class="item-sub">${esc(displayTime(row))}</div></div><div class="item-sub">${esc(row.details || "")}</div><div class="item-sub">${esc(meta(row))}</div></div>`).join("")}</div>` : ""}`;

  weeklyList.innerHTML = weeklyRows.length ? weeklyRows.map((row) => `<div class="item schedule-category--${esc(row.category || "unknown")} schedule-provider--${esc(row.provider || "unknown")} ${scheduleAgeBand(row)}"><div class="item-top"><div class="item-day">${esc(row.day || "—")}</div><div class="item-sub">${esc(displayTime(row))}</div></div><div class="item-title">${scheduleTitle(row)}</div>${row.details ? `<div class="item-sub">${esc(row.details)}</div>` : ""}<div class="item-sub">${esc(meta(row))}</div></div>`).join("") : `<p class="muted-empty"><span class="en">No weekly schedule published for this location.</span><span class="es">No hay horario semanal publicado para esta ubicación.</span></p>`;
  installWeeklyPracticeAccordion(weeklyList, weeklyRows);

  eventsList.innerHTML = visible.events.length ? visible.events.map((event) => `<div class="item"><div class="item-date">${esc(event.date || "—")}</div><div class="item-title">${esc(event.title || "—")}</div>${event.location ? `<div class="item-sub">${esc(event.location)}</div>` : ""}${event.details ? `<div class="item-sub">${esc(event.details)}</div>` : ""}</div>`).join("") : `<p class="muted-empty"><span class="en">No upcoming events published.</span><span class="es">No hay eventos próximos publicados.</span></p>`;

  if (lastUpdated) lastUpdated.textContent = schedule.status === "published" ? `Published schedule — ${schedule.locationName}` : `No published schedule — ${schedule.locationName}`;
}

function waitForUser() {
  if (auth.currentUser) return Promise.resolve(auth.currentUser);
  return new Promise((resolve) => {
    const unsub = onAuthStateChanged(auth, (user) => { unsub(); resolve(user || null); });
  });
}

async function start() {
  const user = await waitForUser();
  if (!user || user.isAnonymous) throw new Error("Parent authentication required.");
  const result = await getMyAthleteCall({});
  if (!result.data?.ok || !result.data?.linked || !result.data?.athlete) throw new Error("No authorized athlete is linked.");
  const requestedId = new URLSearchParams(location.search).get("id") || "";
  const linkedAthletes = Array.isArray(result.data.athletes) ? result.data.athletes : [result.data.athlete];
  const athlete = linkedAthletes.find((item) => item?.id === requestedId) || result.data.athlete;
  const scope = await getAthleteScheduleScopeCall({ athleteId: athlete.id });
  render(await loadPublishedAthleteSchedule(db, athlete, scope.data?.assignments || []), athlete);
  try { const competitionResult = await listMyCompetitionEventsCall({ athleteId:athlete.id }); renderMemberCompetitionSplit(
      competitionUpcomingList,
      competitionEventsList,
      competitionResult.data?.events || [],
      esc,
      { legacyUpcomingContainer: eventsList }
    ); }
  catch (error) { console.error("[parent-competition-schedule] load failed", error); competitionEventsList.innerHTML = '<p class="muted-empty">Competition schedule is temporarily unavailable.</p>'; }
}

start().catch((error) => {
  console.error("[parent-schedule] load failed", error);
  todayCard.innerHTML = `<p class="muted-empty">${esc(error.message || "Schedule unavailable.")}</p>`;
  weeklyList.innerHTML = "";
  eventsList.innerHTML = "";
});
