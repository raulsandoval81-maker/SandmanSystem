(() => {
  "use strict";

  const locations = {
    "santa-ynez-valley": {
      label: "Santa Ynez Valley",
      status: "Draft seed",
      rows: [
        {
          day: "Mon / Wed",
          name: "Strength & Fit",
          type: "fitness",
          provider: "yesc",
          time: "6:00–6:45 PM",
          instructor: "TBD"
        },
        {
          day: "Mon / Wed",
          name: "Kickboxing & Fit",
          type: "fitness",
          provider: "yesc",
          time: "7:00–7:45 PM",
          instructor: "TBD"
        },
        {
          day: "Tue / Thu",
          name: "Youth Muay Thai",
          type: "combat",
          provider: "sandman",
          time: "4:00–5:00 PM",
          instructor: "Coach Sandoval"
        },
        {
          day: "Tue / Thu",
          name: "Youth Wrestling",
          type: "combat",
          provider: "sandman",
          time: "5:00–6:00 PM",
          instructor: "Coach Sandoval"
        },
        {
          day: "Tue / Thu",
          name: "Wrestling",
          type: "combat",
          provider: "sandman",
          time: "5:30–7:00 PM",
          instructor: "Coach Sandoval"
        },
        {
          day: "Tue / Thu",
          name: "Boxing",
          type: "combat",
          provider: "sandman",
          time: "6:30–8:00 PM",
          instructor: "Coach Sandoval"
        }
      ]
    },

    "lompoc": {
      label: "Lompoc",
      status: "No schedule",
      rows: []
    },

    "elk-grove": {
      label: "Elk Grove",
      status: "No schedule",
      rows: []
    }
  };

  const locationSelect = document.getElementById("scheduleLocation");
  const locationName = document.getElementById("scheduleLocationName");
  const locationStatus = document.getElementById("scheduleLocationStatus");
  const rowsEl = document.getElementById("scheduleRows");
  const tableWrap = document.getElementById("scheduleTableWrap");
  const emptyState = document.getElementById("scheduleEmptyState");
  const message = document.getElementById("scheduleMessage");

  const filterButtons = Array.from(
    document.querySelectorAll(".schedule-filter")
  );

  let activeFilter = "all";

  function esc(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function typeLabel(type) {
    return type === "fitness" ? "Fitness" : "Combat";
  }

  function providerLabel(provider) {
    return provider === "yesc" ? "YESC" : "Sandman";
  }

  function render() {
    const location = locations[locationSelect.value];

    if (!location) return;

    locationName.textContent = location.label;
    locationStatus.textContent = location.status;

    const rows = location.rows.filter((row) => {
      return activeFilter === "all" || row.type === activeFilter;
    });

    const hasAnySchedule = location.rows.length > 0;

    emptyState.hidden = hasAnySchedule;
    tableWrap.hidden = !hasAnySchedule;

    rowsEl.innerHTML = rows.map((row) => `
      <tr>
        <td>${esc(row.day)}</td>

        <td>
          <span class="schedule-class-name">
            ${esc(row.name)}
          </span>
        </td>

        <td>
          <span class="schedule-type schedule-type--${esc(row.type)}">
            ${esc(typeLabel(row.type))}
          </span>
        </td>

        <td>
          <span class="schedule-provider schedule-provider--${esc(row.provider)}">
            ${esc(providerLabel(row.provider))}
          </span>
        </td>

        <td>${esc(row.time)}</td>

        <td>${esc(row.instructor)}</td>

        <td>
          <div class="schedule-actions">
            <button class="schedule-action-btn" type="button">
              Edit
            </button>

            <button class="schedule-action-btn" type="button">
              Remove
            </button>
          </div>
        </td>
      </tr>
    `).join("");

    if (hasAnySchedule && rows.length === 0) {
      rowsEl.innerHTML = `
        <tr>
          <td colspan="7">
            No ${esc(typeLabel(activeFilter))} classes in this draft.
          </td>
        </tr>
      `;
    }
  }

  locationSelect?.addEventListener("change", () => {
    activeFilter = "all";

    filterButtons.forEach((button) => {
      button.classList.toggle(
        "is-active",
        button.dataset.filter === "all"
      );
    });

    render();
  });

  filterButtons.forEach((button) => {
    button.addEventListener("click", () => {
      activeFilter = button.dataset.filter || "all";

      filterButtons.forEach((item) => {
        item.classList.toggle("is-active", item === button);
      });

      render();
    });
  });

  function shellOnly(action) {
    if (!message) return;

    message.textContent =
      `${action} is visible for the Management workflow, ` +
      `but this first build does not write or publish schedule data yet.`;
  }

  document.getElementById("addClassBtn")?.addEventListener("click", () => {
    shellOnly("Add Class");
  });

  document.getElementById("saveDraftBtn")?.addEventListener("click", () => {
    shellOnly("Save Draft");
  });

  document.getElementById("previewScheduleBtn")?.addEventListener("click", () => {
    shellOnly("Preview");
  });

  document.getElementById("publishScheduleBtn")?.addEventListener("click", () => {
    shellOnly("Publish");
  });

  render();
})();
