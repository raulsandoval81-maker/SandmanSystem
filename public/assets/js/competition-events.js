const DAY_MS = 86400000;
const HOUR_MS = 3600000;
const MINUTE_MS = 60000;

const competitionTimers = new WeakMap();

const DISCIPLINE_META = Object.freeze({
  wrestling: {
    icon: "🤼",
    label: "Wrestling",
  },
  boxing: {
    icon: "��",
    label: "Boxing",
  },
  "muay-thai": {
    icon: "🥋",
    label: "Muay Thai",
  },
  "submission-grappling": {
    icon: "🤼‍♂️",
    label: "Submission Grappling",
  },
  "strength-honor": {
    icon: "💪",
    label: "Strength & Honor 🔱",
  },
});

function disciplineMeta(event = {}) {
  const id = String(event.disciplineId || "").trim().toLowerCase();

  return (
    DISCIPLINE_META[id] || {
      icon: "◆",
      label: id
        ? id
            .split("-")
            .map((word) =>
              word ? word[0].toUpperCase() + word.slice(1) : ""
            )
            .join(" ")
        : "Competition",
    }
  );
}

export function competitionCalendarDays(event, now = new Date()) {
  const zone = event.timeZone || "America/Los_Angeles";

  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);

  return Math.round(
    (
      Date.parse(`${event.startDate}T00:00:00Z`) -
      Date.parse(`${today}T00:00:00Z`)
    ) / DAY_MS
  );
}

export function zonedEventAnchor(event) {
  const [year, month, day] = String(event.startDate)
    .split("-")
    .map(Number);

  const [hour, minute] = String(
    event.weighInAnchorTime || "06:00"
  )
    .split(":")
    .map(Number);

  const zone =
    event.timeZone || "America/Los_Angeles";

  const desired = Date.UTC(
    year,
    month - 1,
    day,
    hour,
    minute
  );

  let guess = desired;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const parts = Object.fromEntries(
      new Intl.DateTimeFormat("en-US", {
        timeZone: zone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
      })
        .formatToParts(new Date(guess))
        .filter((part) => part.type !== "literal")
        .map((part) => [
          part.type,
          Number(part.value),
        ])
    );

    const observed = Date.UTC(
      parts.year,
      parts.month - 1,
      parts.day,
      parts.hour,
      parts.minute
    );

    guess += desired - observed;
  }

  return new Date(guess);
}

function countdownParts(
  event,
  detail = "days",
  now = new Date()
) {
  const calendarDays =
    competitionCalendarDays(event, now);

  if (detail === "days") {
    return [
      {
        value: Math.max(0, calendarDays),
        label: "DAYS",
      },
    ];
  }

  const ms = Math.max(
    0,
    zonedEventAnchor(event).getTime() -
      now.getTime()
  );

  const days = Math.floor(ms / DAY_MS);
  const hours = Math.floor(
    (ms % DAY_MS) / HOUR_MS
  );
  const minutes = Math.floor(
    (ms % HOUR_MS) / MINUTE_MS
  );

  const parts = [];

  if (days > 0) {
    parts.push({
      value: days,
      label: "DAYS",
    });
  } else if (calendarDays === 0) {
    parts.push({
      value: "TODAY",
      label: "",
      today: true,
    });
  }

  parts.push({
    value: hours,
    label: "HRS",
  });

  if (detail === "minutes") {
    parts.push({
      value: minutes,
      label: "MIN",
    });
  }

  return parts;
}

export function competitionCountdown(
  event,
  enhanced,
  now = new Date()
) {
  const detail =
    enhanced === true ? "hours" : "days";

  return countdownParts(event, detail, now)
    .map((part) =>
      part.today
        ? "TODAY"
        : `${part.value} ${part.label}`
    )
    .join(" · ");
}

function countdownDetail(index, count) {
  if (count <= 1) return "minutes";

  const third = Math.ceil(count / 3);

  if (index < third) return "minutes";
  if (index < third * 2) return "hours";

  return "days";
}

export function prepareMemberCompetitionEvents(
  events,
  now = new Date()
) {
  const upcoming = [...events]
    .filter((event) => {
      const zone =
        event.timeZone || "America/Los_Angeles";

      const today = new Intl.DateTimeFormat(
        "en-CA",
        {
          timeZone: zone,
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
        }
      ).format(now);

      return (
        event.publicationStatus === "published" &&
        event.status === "active" &&
        String(event.endDate || event.startDate) >=
          today
      );
    })
    .sort((a, b) =>
      String(a.startDate).localeCompare(
        String(b.startDate)
      )
    );

  return upcoming.map((event, index) => {
    const countdownDetailLevel =
      countdownDetail(index, upcoming.length);

    return {
      ...event,
      countdownDetail: countdownDetailLevel,
      countdownParts: countdownParts(
        event,
        countdownDetailLevel,
        now
      ),
    };
  });
}

function renderCountdown(parts, escapeHtml) {
  return `
    <div class="member-competition-clock" aria-label="${escapeHtml(
      parts
        .map((part) =>
          part.today
            ? "Today"
            : `${part.value} ${part.label}`
        )
        .join(", ")
    )}">
      ${parts
        .map(
          (part) => `
            <span class="member-competition-clock-box${
              part.today ? " is-today" : ""
            }">
              <strong>${escapeHtml(
                part.value
              )}</strong>
              ${
                part.label
                  ? `<small>${escapeHtml(
                      part.label
                    )}</small>`
                  : ""
              }
            </span>
          `
        )
        .join("")}
    </div>
  `;
}

export function renderMemberCompetitionEvents(
  container,
  events,
  escapeHtml,
  now = new Date()
) {
  const prepared =
    prepareMemberCompetitionEvents(events, now);

  container.innerHTML = prepared.length
    ? prepared
        .map((event) => {
          const discipline =
            disciplineMeta(event);

          return `
            <article class="member-competition-card">
              <div class="member-competition-main">

                <div class="member-competition-topline">
                  <span class="member-competition-discipline">
                    <span
                      class="member-competition-discipline-icon"
                      aria-hidden="true"
                    >${escapeHtml(
                      discipline.icon
                    )}</span>

                    <span>${escapeHtml(
                      discipline.label
                    )}</span>
                  </span>

                  ${renderCountdown(
                    event.countdownParts,
                    escapeHtml
                  )}
                </div>

                <h3>${escapeHtml(event.name)}</h3>

                <p>
                  ${escapeHtml(event.startDate)}
                  ${
                    event.endDate
                      ? `–${escapeHtml(
                          event.endDate
                        )}`
                      : ""
                  }
                  ·
                  ${escapeHtml(
                    event.locationName ||
                      "Location pending"
                  )}
                </p>

              </div>
            </article>
          `;
        })
        .join("")
    : '<p class="muted-empty">No published competitions are currently available.</p>';

  const existingTimer =
    competitionTimers.get(container);

  if (existingTimer) {
    clearInterval(existingTimer);
    competitionTimers.delete(container);
  }

  if (
    prepared.some(
      (event) =>
        event.countdownDetail === "minutes"
    )
  ) {
    const timer = setInterval(() => {
      renderMemberCompetitionEvents(
        container,
        events,
        escapeHtml,
        new Date()
      );
    }, MINUTE_MS);

    competitionTimers.set(container, timer);
  }
}

/* SANDMAN-MEMBER-COMPETITION-PROMOTION */

function memberCompetitionOrganization(event = {}) {
  const direct =
    String(event.sanctionCard || "")
      .trim()
      .toUpperCase();

  if (direct) return direct;

  const note =
    String(event.sanctionNote || "")
      .trim()
      .toUpperCase();

  if (note.includes("SCWAY")) return "SCWAY";
  if (note.includes("USAW")) return "USAW";
  if (note.includes("AAU")) return "AAU";
  if (note.includes("RMN")) return "RMN";

  const name =
    String(event.name || "")
      .trim()
      .toUpperCase();

  // Temporary display fallback until Coach owns the field cleanly.
  if (name.includes("RMN")) return "RMN";

  return "ORG UNKNOWN";
}

function safeMemberCompetitionUrl(value = "") {
  const raw = String(value || "").trim();

  if (!raw) return "";

  try {
    const parsed = new URL(raw, window.location.origin);

    if (!["http:", "https:"].includes(parsed.protocol)) {
      return "";
    }

    return parsed.href;
  } catch {
    return "";
  }
}

function addMemberCompetitionMeta(card, event, promoted = false) {
  if (!card || !event) return;

  const organization =
    memberCompetitionOrganization(event);

  const badge =
    document.createElement("span");

  badge.className =
    "member-competition-organization";

  badge.textContent =
    organization;

  const discipline =
    card.querySelector(".member-competition-discipline");

  if (discipline?.parentElement) {
    discipline.insertAdjacentElement(
      "afterend",
      badge
    );
  } else {
    card.prepend(badge);
  }

  if (!promoted) return;

  const url =
    safeMemberCompetitionUrl(
      event.registrationUrl
    );

  const action =
    url
      ? document.createElement("a")
      : document.createElement("span");

  action.className =
    url
      ? "member-competition-action"
      : "member-competition-action is-pending";

  if (url) {
    action.href = url;
    action.target = "_blank";
    action.rel = "noopener noreferrer";
    action.textContent = "Registration / Details";
  } else {
    action.textContent = "Registration link pending";
  }

  card.append(action);
}


/* SANDMAN-COMPETITION-SCHEDULE-ACCORDION */

function competitionPreviewDate(
  event = {}
) {
  const start =
    String(
      event.startDate || ""
    ).trim();

  if (!start) return "";

  try {
    const [y, m, d] =
      start
        .split("-")
        .map(Number);

    return new Intl.DateTimeFormat(
      "en-US",
      {
        month: "short",
        day: "numeric",
        timeZone: "UTC"
      }
    ).format(
      new Date(
        Date.UTC(
          y,
          m - 1,
          d
        )
      )
    );
  } catch {
    return start;
  }
}

function buildCompetitionScheduleAccordion(
  scheduleContainer,
  cards,
  events
) {
  if (!scheduleContainer) return;

  if (!cards.length) {
    scheduleContainer.innerHTML =
      '<p class="muted-empty">No additional competitions are currently scheduled.</p>';

    return;
  }

  const details =
    document.createElement(
      "details"
    );

  details.className =
    "sandman-competition-accordion";

  const summary =
    document.createElement(
      "summary"
    );

  summary.className =
    "sandman-competition-summary";

  const summaryTop =
    document.createElement(
      "span"
    );

  summaryTop.className =
    "sandman-competition-summary__top";

  const summaryText =
    document.createElement(
      "span"
    );

  summaryText.className =
    "sandman-competition-summary__text";

  const strong =
    document.createElement(
      "strong"
    );

  strong.textContent =
    `${cards.length} more scheduled event${cards.length === 1 ? "" : "s"}`;

  const small =
    document.createElement(
      "span"
    );

  small.textContent =
    "View full competition schedule";

  summaryText.append(
    strong,
    small
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

  summaryTop.append(
    summaryText,
    chevron
  );

  summary.append(
    summaryTop
  );

  /*
   * Keep exactly two upcoming previews visible
   * while the full schedule is collapsed.
   */
  const previews =
    document.createElement(
      "span"
    );

  previews.className =
    "sandman-competition-previews";

  events
    .slice(0, 2)
    .forEach((event) => {
      const preview =
        document.createElement(
          "span"
        );

      preview.className =
        "sandman-competition-preview";

      const identity =
        document.createElement(
          "span"
        );

      identity.className =
        "sandman-competition-preview__identity";

      const name =
        document.createElement(
          "strong"
        );

      name.textContent =
        event.name ||
        "Competition";

      const organization =
        document.createElement(
          "span"
        );

      organization.className =
        "sandman-competition-preview__organization";

      organization.textContent =
        memberCompetitionOrganization(
          event
        );

      identity.append(
        name,
        organization
      );

      const date =
        document.createElement(
          "span"
        );

      date.className =
        "sandman-competition-preview__date";

      date.textContent =
        competitionPreviewDate(
          event
        );

      preview.append(
        identity,
        date
      );

      previews.append(
        preview
      );
    });

  summary.append(
    previews
  );

  const full =
    document.createElement(
      "div"
    );

  full.className =
    "member-competition-list sandman-competition-full-list";

  full.append(
    ...cards
  );

  details.append(
    summary,
    full
  );

  scheduleContainer.replaceChildren(
    details
  );
}

export function renderMemberCompetitionSplit(
  promotedContainer,
  scheduleContainer,
  events,
  escapeHtml,
  options = {}
) {
  if (!promotedContainer || !scheduleContainer) {
    return;
  }

  const now =
    options.now instanceof Date
      ? options.now
      : new Date();

  /*
   * Render the FULL list first through the existing shared renderer.
   * Then physically split its finished cards.
   *
   * This preserves the countdown hierarchy already approved:
   * first third = days/hours/minutes
   * middle third = days/hours
   * final third = days
   */
  const scratch =
    document.createElement("div");

  renderMemberCompetitionEvents(
    scratch,
    events,
    escapeHtml,
    now
  );

  const prepared =
    prepareMemberCompetitionEvents(
      events,
      now
    );

  const cards =
    Array.from(
      scratch.querySelectorAll(
        ".member-competition-card"
      )
    );

  const promotedCount =
    Math.min(3, cards.length);

  cards.forEach((card, index) => {
    addMemberCompetitionMeta(
      card,
      prepared[index] || {},
      index < promotedCount
    );
  });

  promotedContainer.replaceChildren(
    ...cards.slice(0, promotedCount)
  );

  const remainingCards =
    cards.slice(promotedCount);

  const remainingEvents =
    prepared.slice(promotedCount);

  buildCompetitionScheduleAccordion(
    scheduleContainer,
    remainingCards,
    remainingEvents
  );

  promotedContainer.hidden =
    promotedCount === 0;

  if (!cards.length) {
    promotedContainer.innerHTML =
      '<p class="muted-empty">No published competitions are currently available.</p>';
  }

  /*
   * Existing academy/event feed stays intact.
   * If it contains only its empty-message placeholder,
   * hide that placeholder while promoted competitions exist.
   */
  const legacy =
    options.legacyUpcomingContainer || null;

  if (legacy) {
    const hasRealLegacyEvent =
      Boolean(
        legacy.querySelector(
          ".item, article, [data-event]"
        )
      );

    legacy.hidden =
      promotedCount > 0 &&
      !hasRealLegacyEvent;
  }
}
