import {
  db,
  ensureSignedIn,
  doc,
  getDoc,
  setDoc,
  serverTimestamp
} from "/assets/js/firebase-init-para.js";

await ensureSignedIn();

const DOC_REF = doc(db, "system", "schedule");

const dailyList = document.getElementById("daily-list");
const monthlyList = document.getElementById("monthly-list");
const btnAddDaily = document.getElementById("btn-add-daily");
const btnAddMonthly = document.getElementById("btn-add-monthly");
const btnSaveAll = document.getElementById("btn-save-all");
const statusEl = document.getElementById("status");

const bannerActiveEl = document.getElementById("banner-active");
const bannerTextEl = document.getElementById("banner-text");

function setStatus(msg = "", isError = false) {
  if (!statusEl) return;
  statusEl.textContent = msg;
  statusEl.style.color = isError ? "#fecaca" : "#ffdd48";
}

function escapeAttr(str = "") {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function escapeHTML(str = "") {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function makeRow(type, item = {}) {
  const wrap = document.createElement("div");
  wrap.className = "row-card";
  wrap.dataset.type = type;

  const isDaily = type === "daily";

if (isDaily) {
  wrap.innerHTML = `
    <div class="row-grid">
      <div class="field">
        <label class="label">Day</label>
        <select data-key="day" multiple>
          ${["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"]
            .map(d => {
              const selected = String(item.day || "").includes(d) ? "selected" : "";
              return `<option value="${d}" ${selected}>${d}</option>`;
            })
            .join("")}
        </select>
      </div>

      <div class="field">
        <label class="label">Start</label>
        <input
          data-key="start"
          type="text"
          value="${escapeAttr(item.start || "")}"
          placeholder="17:30">
      </div>

      <div class="field">
        <label class="label">End</label>
        <input
          data-key="end"
          type="text"
          value="${escapeAttr(item.end || "")}"
          placeholder="19:00">
      </div>

      <div class="field">
        <label class="label">Display Label</label>
        <input
          data-key="label"
          type="text"
          value="${escapeAttr(item.label || item.time || "")}"
          placeholder="5:30–7:00 PM">
      </div>

      <div class="field">
        <label class="label">Title</label>
        <input
          data-key="title"
          type="text"
          value="${escapeAttr(item.title || "")}"
          placeholder="Daily Grind">
      </div>

      <div class="field">
        <label class="label">Details</label>
        <textarea
          data-key="details"
          placeholder="Combat practice.">${escapeHTML(item.details || "")}</textarea>
      </div>

      <div class="field">
        <button class="btn btn-danger" type="button" data-act="remove">Remove</button>
      </div>
    </div>
  `;
} else {
  wrap.innerHTML = `
    <div class="row-grid">
      <div class="field">
        <label class="label">Date</label>
        <input
          data-key="date"
          type="text"
          value="${escapeAttr(item.date || "")}"
          placeholder="March 16, 2026">
      </div>

      <div class="field">
        <label class="label">Time / Location</label>
        <input
          data-key="location"
          type="text"
          value="${escapeAttr(item.location || "")}"
          placeholder="7:00 AM departure • Lompoc, CA">
      </div>

      <div class="field">
        <label class="label">Title</label>
        <input
          data-key="title"
          type="text"
          value="${escapeAttr(item.title || "")}"
          placeholder="Beach Brawl">
      </div>

      <div class="field">
        <label class="label">Details</label>
        <textarea
          data-key="details"
          placeholder="USA card required • Arrival 7:00 AM">${escapeHTML(item.details || "")}</textarea>
      </div>

      <div class="field">
        <button class="btn btn-danger" type="button" data-act="remove">Remove</button>
      </div>
    </div>
  `;
}
  wrap.querySelector('[data-act="remove"]')?.addEventListener("click", () => {
    wrap.remove();
  });

  return wrap;
}

function collectRows(container, type) {
  if (!container) return [];

  return [...container.querySelectorAll(".row-card")]
    .map((row) => {
      const get = (key) => row.querySelector(`[data-key="${key}"]`)?.value?.trim() || "";

      if (type === "daily") {
        return {
day: [...row.querySelector('[data-key="day"]').selectedOptions]
  .map(o => o.value)
  .join(", "),
          start: get("start"),
          end: get("end"),
          label: get("label"),
          title: get("title"),
          details: get("details")
        };
      }

      return {
        date: get("date"),
        location: get("location"),
        title: get("title"),
        details: get("details")
      };
    })
    .filter((x) => Object.values(x).some(Boolean));
}

function seedDefaults() {
  if (dailyList && !dailyList.children.length) {
    [
      {
        day: "Monday",
        start: "17:30",
        end: "19:00",
        label: "5:30–7:00 PM",
        title: "Daily Grind",
        details: "Combat practice. Bring water."
      },
      {
        day: "Wednesday",
        start: "17:30",
        end: "19:00",
        label: "5:30–7:00 PM",
        title: "Daily Grind",
        details: "Combat practice."
      },
      {
        day: "Friday",
        start: "17:30",
        end: "19:00",
        label: "5:30–7:00 PM",
        title: "Daily Grind",
        details: "Combat practice."
      },
      {
        day: "Saturday",
        start: "08:00",
        end: "09:00",
        label: "8:00 AM",
        title: "Beach Work",
        details: "Strength"
      }
    ].forEach((item) => dailyList.appendChild(makeRow("daily", item)));
  }

  if (monthlyList && !monthlyList.children.length) {
    monthlyList.appendChild(
      makeRow("tournament", {
        date: "This Month",
        location: "No date posted yet",
        title: "Tournament Schedule",
        details: "No tournament posted yet."
      })
    );
  }
}

function loadBanner(data = {}) {
  if (!bannerActiveEl || !bannerTextEl) return;

  const banner = data.banner || {};
  bannerActiveEl.checked = banner.active === true;
  bannerTextEl.value = String(banner.text || "");
}

async function loadSchedule() {
  setStatus("Loading schedule...");

  try {
    const snap = await getDoc(DOC_REF);

    if (dailyList) dailyList.innerHTML = "";
    if (monthlyList) monthlyList.innerHTML = "";

    if (!snap.exists()) {
      seedDefaults();
      loadBanner({});
      setStatus("No saved schedule yet. Defaults loaded.");
      return;
    }

    const data = snap.data() || {};
    const daily = Array.isArray(data.daily) ? data.daily : [];
    const tournaments = Array.isArray(data.tournaments) ? data.tournaments : [];

    if (daily.length) {
      daily.forEach((item) => dailyList.appendChild(makeRow("daily", item)));
    }

    if (tournaments.length) {
      tournaments.forEach((item) => monthlyList.appendChild(makeRow("tournament", item)));
    }

    loadBanner(data);
    seedDefaults();
    setStatus("Schedule loaded.");
  } catch (err) {
    console.error("[schedule-admin] load failed:", err);
    seedDefaults();
    loadBanner({});
    setStatus("Failed to load schedule. Defaults shown.", true);
  }
}

btnAddDaily?.addEventListener("click", () => {
  dailyList?.appendChild(makeRow("daily"));
});

btnAddMonthly?.addEventListener("click", () => {
  monthlyList?.appendChild(makeRow("tournament"));
});

btnSaveAll?.addEventListener("click", async () => {
  const daily = collectRows(dailyList, "daily");
  const tournaments = collectRows(monthlyList, "tournament");

  const banner = {
    active: bannerActiveEl?.checked === true,
    text: (bannerTextEl?.value || "").trim()
  };

  btnSaveAll.disabled = true;
  const oldText = btnSaveAll.textContent;
  btnSaveAll.textContent = "Saving...";
  setStatus("Saving schedule...");

  try {
    await setDoc(
      DOC_REF,
      {
        daily,
        tournaments,
        banner,
        updatedAt: serverTimestamp()
      },
      { merge: true }
    );

    setStatus("Schedule saved.");
  } catch (err) {
    console.error("[schedule-admin] save failed:", err);
    setStatus("Save failed. Check console.", true);
  } finally {
    btnSaveAll.textContent = oldText;
    btnSaveAll.disabled = false;
  }
});

loadSchedule();