import {
  db,
  collection,
  getDocs,
  query,
  limit,
  doc,
  updateDoc,
  serverTimestamp,
  ensureSignedIn
} from "/assets/js/firebase-init.js";

import { renderDigitalBelt } from "/assets/js/digital-belt.js";
import { LADDER_F4, LADDER_F8 } from "/assets/js/ladder.service.js";

const $ = (id) => document.getElementById(id);

let currentList = [];

function trackBaseOf(id) {
  if (id.startsWith("F4_")) return "F4";
  if (id.startsWith("F8_")) return "F8";
  return "";
}

function xpCapForAthlete(data = {}, track = "F4") {
  const ladder = track === "F8" ? LADDER_F8 : LADDER_F4;
  const rankName = data.rankName || data.tierName;
  const tier = ladder.find((t) => t.name === rankName) || ladder[0];

  return Number(
    tier?.cap ??
    data.xpCap ??
    data.cap ??
    data.tierCap ??
    (track === "F8" ? 600 : 1000)
  );
}

function rosterStatusOf(a = {}) {
  return String(a.rosterStatus || "current");
}

function isArchiveView() {
  return !!window.__rosterArchiveView;
}

function athleteName(data = {}, id = "") {
  return data.publicName || data.fullName || data.name || id;
}

function profileUrlForAthlete(id, data = {}) {
  const profileType = String(data.profileType || "").toLowerCase();

  if (profileType === "mini") {
    return `/athletes/profile/mini-profile.html?id=${encodeURIComponent(id)}`;
  }

  if (profileType === "adult") {
    return `/athletes/profile/adult-profile.html?id=${encodeURIComponent(id)}`;
  }

  return `/athletes/profile/athlete-profile.html?id=${encodeURIComponent(id)}`;
}

function dateFromFirestore(raw) {
  if (!raw) return null;
  if (raw.toDate) return raw.toDate();
  return new Date(raw);
}

function daysSince(raw) {
  const date = dateFromFirestore(raw);
  if (!date || Number.isNaN(date.getTime())) return null;
  return Math.floor((Date.now() - date.getTime()) / 86400000);
}

function lastSeenText(data = {}) {
  const days = daysSince(data.lastAttendanceAt);

  if (days === null) return "No attendance logged";
  if (days <= 0) return "Today";
  if (days === 1) return "1 day ago";

  return `${days} days ago`;
}

function getTempoStatus(data = {}, track = "F4") {
  const xp = Number(data.xp || 0);
  const cap = xpCapForAthlete(data, track);
  const pct = Math.round((xp / (cap || 1)) * 100);
  const testingState = String(data.testing?.state || "").toUpperCase();

  if (testingState === "PROMOTED") return "promoted";
  if (testingState === "COOLDOWN") return "cooldown";
  if (testingState === "FREEZE" || testingState === "FROZEN") return "freeze";
  if (testingState === "TEMPLE") return "in-temple";
  if (xp >= cap) return "eligible";
  if (pct >= 90 && xp < cap) return "temple-watch";

  return "";
}

function tempoChipHtml(data = {}, track = "F4") {
  const status = getTempoStatus(data, track);

  if (status === "promoted") {
    return `<span class="status-chip status-chip--promoted">Promoted</span>`;
  }

  if (status === "cooldown") {
    return `<span class="status-chip status-chip--cooldown">Cooldown</span>`;
  }

  if (status === "freeze") {
    return `<span class="status-chip status-chip--freeze">Freeze</span>`;
  }

  if (status === "in-temple") {
    return `<span class="status-chip status-chip--tempo">In Temple</span>`;
  }

  if (status === "temple-watch") {
    return `<span class="status-chip status-chip--watch">Temple Watch</span>`;
  }

  if (status === "eligible") {
    return `<span class="status-chip status-chip--eligible">Eligible</span>`;
  }

  return "";
}

async function archiveAthlete(uid) {
  await updateDoc(doc(db, "athletes", uid), {
    rosterStatus: "archived",
    updatedAt: serverTimestamp()
  });
}

async function restoreAthlete(uid) {
  await updateDoc(doc(db, "athletes", uid), {
    rosterStatus: "current",
    updatedAt: serverTimestamp()
  });
}

async function loadRoster() {
  await ensureSignedIn();

  const rowsEl = $("rows");
  const countMeta = $("countMeta");
  const archiveBtn = $("toggleArchiveView");
  const journeyFilter = $("journeyFilter")?.value || "all";
  const disciplineFilter = $("disciplineFilter")?.value || "all";


  if (!rowsEl) return;

  const track = journeyFilter === "z2h" ? "F8" : "F4";
  const wantedStatus = isArchiveView() ? "archived" : "current";

  rowsEl.innerHTML = `
    <tr>
      <td colspan="4" class="muted">Loading…</td>
    </tr>
  `;

  if (archiveBtn) {
    archiveBtn.textContent = isArchiveView() ? "Current" : "Archived";
  }

  const snap = await getDocs(
    query(
      collection(db, "athletes"),
      limit(500)
    )
  );

  currentList = snap.docs
    .map((d) => ({
      id: d.id,
      data: d.data() || {}
    }))
    .filter((x) => rosterStatusOf(x.data) === wantedStatus)
.filter((x) => {
  if (journeyFilter === "all") return true;

  const journey = String(
    x.data.journey ||
    x.data.track ||
    x.data.trackCode ||
    x.data.program ||
    ""
  ).toLowerCase();

  if (journeyFilter === "z2h") {
    return journey.includes("z2h") || journey.includes("foundry8") || x.id.startsWith("F8_");
  }

  if (journeyFilter === "p2l") {
    return journey.includes("p2l") || journey.includes("foundry4") || x.id.startsWith("F4_");
  }

  if (journeyFilter === "r2g") {
    return journey.includes("r2g") || journey.includes("road");
  }

  if (journeyFilter === "q2m") {
    return journey.includes("q2m") || journey.includes("quest");
  }

  return true;
})
    .filter((x) => {
      if (disciplineFilter === "all") return true;

      const disciplines = new Set(
        [
          ...(Array.isArray(x.data.disciplineIds)
            ? x.data.disciplineIds
            : []),

          ...Object.keys(x.data.disciplines || {}),

          x.data.activeDiscipline,
          x.data.primaryDiscipline,
          x.data.discipline,
          x.data.art,
          x.data.sport,
          x.data.trackDiscipline
        ]
          .map((value) =>
            String(value || "")
              .trim()
              .toLowerCase()
          )
          .filter(Boolean)
      );

      return disciplines.has(
        String(disciplineFilter)
          .trim()
          .toLowerCase()
      );
    })
    .sort((a, b) =>
      athleteName(a.data, a.id)
        .localeCompare(athleteName(b.data, b.id))
    );

  if (countMeta) {
    countMeta.textContent =
      `${track} · ${wantedStatus} · ${currentList.length} athletes`;
  }

  rowsEl.innerHTML = currentList.length
    ? currentList.map(({ id, data }) => `
      <tr>
        <td data-label="Athlete">
          <div class="name-col">
            <div>
              <div class="name-line">
                ${athleteName(data, id)}
                ${!isArchiveView() ? tempoChipHtml(data, track) : ""}
              </div>

              <div class="roster-actions" style="margin-top:6px;">
<a
  class="pill"
  href="${profileUrlForAthlete(id, data)}"
>
  Profile
</a>
                ${
                  isArchiveView()
                    ? `<button class="pill" type="button" data-restore="${id}">Restore</button>`
                    : `<button class="pill" type="button" data-archive="${id}">Archive</button>`
                }
              </div>
            </div>
          </div>
        </td>

        <td data-label="Tier / Rank">
          ${data.rankName || "—"}
        </td>

        <td data-label="XP">
          <div class="belt-stack">
            <div id="rankBar-${id}" class="mini-belt-slot"></div>
            <div id="stripeText-${id}" class="xp-sub"></div>
          </div>
        </td>

        <td data-label="Last Seen">
          <div class="xp-sub">
            ${lastSeenText(data)}
          </div>
        </td>
      </tr>
    `).join("")
    : `
      <tr>
        <td colspan="4" class="muted">No athletes found.</td>
      </tr>
    `;

  document.querySelectorAll("[data-archive]").forEach((btn) => {
    btn.onclick = async () => {
      const uid = btn.dataset.archive;
      if (!uid) return;

      const ok = window.confirm(`Archive ${uid}?`);
      if (!ok) return;

      try {
        await archiveAthlete(uid);
        await loadRoster();
      } catch (err) {
        console.error("[roster] archive failed", err);
        alert("Could not archive athlete.");
      }
    };
  });

  document.querySelectorAll("[data-restore]").forEach((btn) => {
    btn.onclick = async () => {
      const uid = btn.dataset.restore;
      if (!uid) return;

      const ok = window.confirm(`Restore ${uid}?`);
      if (!ok) return;

      try {
        await restoreAthlete(uid);
        await loadRoster();
      } catch (err) {
        console.error("[roster] restore failed", err);
        alert("Could not restore athlete.");
      }
    };
  });

  for (const { id, data } of currentList) {
    const ladder = track === "F8" ? LADDER_F8 : LADDER_F4;
    const tier = ladder.find((t) => t.name === data.rankName) || ladder[0];

    const xpNow = Number(data.xp ?? data.currentTierXP ?? 0);
    const xpCap = xpCapForAthlete(data, track);
    const stripeMax = Number(tier.stripes ?? 4);
    const stripeSize = Number(tier.stripe ?? (xpCap / stripeMax));

    const calculatedStripes =
      Math.min(stripeMax, Math.floor(xpNow / stripeSize));

    const finalStripes =
      Math.max(Number(data.stripeCount ?? 0), calculatedStripes);

const colorMaps = {
  z2h: {
    Shadow: "belt-z2h-shadow",
    Recruit: "belt-z2h-recruit",
    Contender: "belt-z2h-contender",
    Competitor: "belt-z2h-competitor",
    Warrior: "belt-z2h-warrior",
    Champion: "belt-z2h-champion",
    Commander: "belt-z2h-commander",
    Hero: "belt-z2h-hero"
  },

  p2l: {
    Apprentice: "belt-p2l-apprentice",
    Warrior: "belt-p2l-warrior",
    Champion: "belt-p2l-champion",
    Veteran: "belt-p2l-veteran",
    Legend: "belt-p2l-legend"
  },

  r2g: {
    Apprentice: "belt-r2g-apprentice",
    Warrior: "belt-r2g-warrior",
    Champion: "belt-r2g-champion",
    Veteran: "belt-r2g-veteran",
    Craftsman: "belt-r2g-craftsman"
  },

  q2m: {
    Apprentice: "belt-q2m-apprentice",
    Warrior: "belt-q2m-warrior",
    Champion: "belt-q2m-champion",
    Veteran: "belt-q2m-veteran",
    Master: "belt-q2m-master"
  }
};

const journey = String(
  data.journey ||
  data.program ||
  data.track ||
  data.trackCode ||
  (track === "F8" ? "z2h" : "p2l")
).toLowerCase();

const colorClass =
  colorMaps[journey]?.[data.rankName] ||
  "belt-p2l-apprentice";

      const beltEl = document.getElementById(`rankBar-${id}`);
    if (beltEl) {
      beltEl.innerHTML = renderDigitalBelt({
        colorClass,
        stripes: finalStripes,
        size: "small"
      });
    }

    const textEl = document.getElementById(`stripeText-${id}`);
    if (textEl) {
      const xpPercent = Math.min(
        100,
        Math.round((xpNow / xpCap) * 100)
      );

      textEl.textContent =
        `${xpNow} / ${xpCap} XP · ${xpPercent}% · Stripes: ${finalStripes} / ${stripeMax}`;
    }
  }
}

loadRoster();

$("journeyFilter")?.addEventListener("change", loadRoster);

$("toggleArchiveView")?.addEventListener("click", () => {
  window.__rosterArchiveView = !window.__rosterArchiveView;
  loadRoster();
});

$("disciplineFilter")?.addEventListener("change", loadRoster);