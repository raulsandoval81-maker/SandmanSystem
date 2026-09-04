import {
  auth,
  db,
  collection,
  getDocs,
  query,
  limit,
  doc,
  updateDoc,
  serverTimestamp
} from "/assets/js/firebase-init.js";

import { coachLoginUrl } from "/assets/js/coach-guard.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.13.1/firebase-auth.js";
import { renderDigitalBelt } from "/assets/js/digital-belt.js";
import { LADDER_F4, LADDER_F8, canonicalF8XpCap } from "/assets/js/ladder.service.js";

const $ = (id) => document.getElementById(id);

let currentList = [];

function waitForAuthUser() {
  return new Promise((resolve, reject) => {
    const unsubscribe = onAuthStateChanged(
      auth,
      (user) => {
        unsubscribe();
        resolve(user);
      },
      (error) => {
        unsubscribe();
        reject(error);
      }
    );
  });
}

async function requireRosterCoach() {
  const user = auth.currentUser || await waitForAuthUser();

  if (!user || user.isAnonymous) {
    throw new Error("Coach authentication required.");
  }

  const token = await user.getIdTokenResult(true);
  const claims = token.claims || {};
  const role = String(claims.role || "").trim().toLowerCase();
  const authorized = role === "coach" ||
    role === "admin" ||
    claims.coach === true ||
    claims.admin === true;

  if (!authorized) {
    throw new Error("Coach access required.");
  }

  return user;
}

function trackBaseOf(id = "") {
  if (id.startsWith("F4_")) return "F4";
  if (id.startsWith("F8_")) return "F8";
  return "";
}

function journeyText(data = {}) {
  return String(
    data.journey ||
    data.program ||
    data.track ||
    data.trackCode ||
    data.ladderKey ||
    ""
  ).trim().toLowerCase();
}

function athleteTrackOf(id = "", data = {}) {
  const idTrack = trackBaseOf(id);
  if (idTrack) return idTrack;

  const journey = journeyText(data);
  if (
    journey.includes("z2h") ||
    journey.includes("zero2hero") ||
    journey.includes("foundry8") ||
    journey.includes("road2champion") ||
    journey.includes("road to champion") ||
    journey.includes("r2c")
  ) {
    return "F8";
  }

  return "F4";
}

function tierNumber(data = {}, track = "F4") {
  const source = track === "F8"
    ? (data.progressionTier ?? data.tier ?? data.tierNum ?? data.rankNum ?? 0)
    : (data.tier ?? data.tierNum ?? data.rankNum ?? 0);

  if (typeof source === "number") return source;
  const match = String(source).match(/T(\d+)/i);
  if (match) return Number(match[1]) || 0;
  return Number(String(source).replace(/[^\d]/g, "")) || 0;
}

function canonicalRankName(data = {}, track = "F4") {
  const ladder = track === "F8" ? LADDER_F8 : LADDER_F4;
  const storedRank = String(data.rankName || data.tierName || "").trim();
  const tierNum = tierNumber(data, track);
  const tier = ladder[tierNum];

  if (track === "F8" && (storedRank === "Hero" || tierNum === 4)) {
    return "Champion";
  }

  return tier?.name || tier?.rank || storedRank || (track === "F8" ? "Shadow" : "Apprentice");
}

function journeyKeyOf(id = "", data = {}) {
  if (athleteTrackOf(id, data) === "F8") return "z2h";
  const journey = journeyText(data);
  if (journey.includes("q2m") || journey.includes("quest") || journey.includes("mastery")) {
    return "q2m";
  }
  return "p2l";
}

function matchesJourneyFilter(filter = "all", id = "", data = {}) {
  if (filter === "all") return true;
  const journey = journeyText(data);

  if (filter === "z2h") return athleteTrackOf(id, data) === "F8";
  if (filter === "p2l") {
    return journey.includes("p2l") ||
      journey.includes("path2legend") ||
      journey.includes("path to legend") ||
      journey.includes("foundry4") ||
      id.startsWith("F4_");
  }
  if (filter === "q2m") {
    return journey.includes("q2m") || journey.includes("quest") || journey.includes("mastery");
  }
  if (filter === "r2g") return journey.includes("r2g") || journey.includes("road");
  return true;
}

function displayRankName(id = "", data = {}) {
  const journeyKey = journeyKeyOf(id, data);
  const tierNum = tierNumber(data, journeyKey === "z2h" ? "F8" : "F4");
  const storedRank = String(data.rankName || data.tierName || "").trim();
  const hasTierIdentity = data.progressionTier != null ||
    data.tier != null ||
    data.tierNum != null ||
    data.rankNum != null;
  const displayLadders = {
    z2h: ["Shadow", "Prospect", "Competitor", "Contender", "Champion"],
    p2l: ["Apprentice", "Warrior", "Hero", "Veteran", "Legend"],
    q2m: ["Apprentice", "Warrior", "Hero", "Veteran", "Master"]
  };

  if (!hasTierIdentity && storedRank) {
    if (journeyKey === "z2h" && storedRank === "Hero") return "Champion";
    if (journeyKey !== "z2h" && storedRank === "Champion") return "Hero";
    if (journeyKey === "q2m" && storedRank === "Mastery") return "Master";
    return storedRank;
  }

  return displayLadders[journeyKey]?.[tierNum] || canonicalRankName(
    data,
    journeyKey === "z2h" ? "F8" : "F4"
  );
}

function xpCapForAthlete(data = {}, track = "F4") {
  if (track === "F8") return canonicalF8XpCap(data);
  const ladder = track === "F8" ? LADDER_F8 : LADDER_F4;
  const rankName = canonicalRankName(data, track);
  const tier = ladder[tierNumber(data, track)] ||
    ladder.find((item) => item.name === rankName || item.rank === rankName) ||
    ladder[0];

  return Number(
    tier?.cap ??
    data.xpCap ??
    data.cap ??
    data.tierCap ??
    (track === "F8" ? 800 : 1000)
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
  const rowsEl = $("rows");
  const countMeta = $("countMeta");
  const archiveBtn = $("toggleArchiveView");
  const journeyFilter = $("journeyFilter")?.value || "all";
  const disciplineFilter = $("disciplineFilter")?.value || "all";


  if (!rowsEl) return;

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
  return matchesJourneyFilter(journeyFilter, x.id, x.data);
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
    countMeta.textContent = `${wantedStatus} · ${currentList.length} athletes`;
  }

  rowsEl.innerHTML = currentList.length
    ? currentList.map(({ id, data }) => `
      <tr>
        <td data-label="Athlete">
          <div class="name-col">
            <div>
              <div class="name-line">
                ${athleteName(data, id)}
                ${!isArchiveView() ? tempoChipHtml(data, athleteTrackOf(id, data)) : ""}
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
          ${displayRankName(id, data)}
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
        await safeLoadRoster();
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
        await safeLoadRoster();
      } catch (err) {
        console.error("[roster] restore failed", err);
        alert("Could not restore athlete.");
      }
    };
  });

  for (const { id, data } of currentList) {
    // Identity stays on the root athlete document.
    // Combat progression comes from the selected discipline.
    const selectedDiscipline = String(
      disciplineFilter !== "all"
        ? disciplineFilter
        : data.activeDiscipline ||
          data.primaryDiscipline ||
          data.discipline ||
          data.art ||
          "wrestling"
    )
      .trim()
      .toLowerCase();

    const combat =
      data.disciplines?.[selectedDiscipline] ||
      data;

    const athleteTrack = athleteTrackOf(id, data);

    const ladder =
      athleteTrack === "F8"
        ? LADDER_F8
        : LADDER_F4;

    const tierNum = tierNumber(combat, athleteTrack);

    const tier =
      ladder[tierNum] ||
      ladder.find((item) =>
        item.name === combat.rankName ||
        item.rank === combat.rankName
      ) ||
      ladder[0];

    const rankName = displayRankName(id, { ...data, ...combat });

    const xpNow = Number(
      combat.xp ??
      combat.currentTierXP ??
      0
    );

    const xpCap = Number(
      tier?.cap ??
      combat.xpCap ??
      combat.cap ??
      combat.tierCap ??
      (athleteTrack === "F8"
        ? 800
        : 1000)
    );

    const stripeMax = Number(
      tier?.stripes ??
      4
    );

    const storedStripes = Number(
      combat.stripeCount ??
      combat.stripes ??
      0
    );

    const calculatedStripes =
      athleteTrack === "F8" &&
      Array.isArray(tier?.stripeThresholds)
        ? tier.stripeThresholds.filter(
            (threshold) => xpNow >= Number(threshold)
          ).length
        : (
            xpNow >= xpCap
              ? stripeMax
              : Math.floor(
                  (xpNow / Math.max(1, xpCap)) *
                  stripeMax
                )
          );

    const finalStripes = Math.max(
      0,
      Math.min(
        stripeMax,
        Math.max(
          storedStripes,
          calculatedStripes
        )
      )
    );

    const colorMaps = {
      z2h: {
        Shadow: "belt-z2h-shadow",
        Prospect: "belt-z2h-recruit",
        Competitor: "belt-z2h-competitor",
        Contender: "belt-z2h-contender",
        Champion: "belt-z2h-hero",
        Hero: "belt-z2h-hero"
      },

p2l: {
  Apprentice: "belt-p2l-apprentice",
  Warrior: "belt-p2l-warrior",
  Hero: "belt-p2l-champion",
  Champion: "belt-p2l-champion",
  Veteran: "belt-p2l-veteran",
  Legend: "belt-p2l-legend"
},

      q2m: {
        Apprentice: "belt-q2m-apprentice",
        Warrior: "belt-q2m-warrior",
        Hero: "belt-q2m-champion",
        Champion: "belt-q2m-champion",
        Veteran: "belt-q2m-veteran",
        Master: "belt-q2m-master",
        Mastery: "belt-q2m-master"
      }
    };

    const rawJourney = String(
      combat.journey ||
      data.journey ||
      data.program ||
      data.track ||
      data.trackCode ||
      ""
    ).toLowerCase();

const journeyKey =
  id.startsWith("F8_") ||
  rawJourney.includes("z2h") ||
  rawJourney.includes("zero2hero") ||
  rawJourney.includes("foundry8")
    ? "z2h"
    : rawJourney.includes("q2m") ||
      rawJourney.includes("mastery")
      ? "q2m"
      : "p2l";

const beltFamily =
  journeyKey === "z2h"
    ? "z2h"
    : journeyKey === "q2m"
      ? "q2m"
      : "p2l";

let colorClass =
  colorMaps[beltFamily]?.[rankName];

if (
  beltFamily === "p2l" &&
  rankName === "Apprentice"
) {
  colorClass =
    selectedDiscipline === "boxing"
      ? "belt-p2l-apprentice-gray"
      : "belt-p2l-apprentice";
}

colorClass =
  colorClass ||
  (
    beltFamily === "z2h"
      ? "belt-z2h-shadow"
      : beltFamily === "q2m"
        ? "belt-q2m-apprentice"
        : selectedDiscipline === "boxing"
          ? "belt-p2l-apprentice-gray"
          : "belt-p2l-apprentice"
  );

    const beltEl =
      document.getElementById(
        `rankBar-${id}`
      );

    if (beltEl) {
      beltEl.innerHTML = renderDigitalBelt({
        colorClass,
        stripes: finalStripes,
        size: "small"
      });
    }

    const textEl =
      document.getElementById(
        `stripeText-${id}`
      );

    if (textEl) {
      const xpPercent = Math.min(
        100,
        Math.round(
          (xpNow / Math.max(1, xpCap)) *
          100
        )
      );

      textEl.textContent =
        `${xpNow} / ${xpCap} XP · ` +
        `${xpPercent}% · ` +
        `Stripes: ${finalStripes} / ${stripeMax}`;
    }
  }
}

function showLoadFailure(error) {
  console.error("[roster] load failed", error);
  const rowsEl = $("rows");
  const countMeta = $("countMeta");
  if (countMeta) countMeta.textContent = "Roster unavailable";
  if (rowsEl) {
    rowsEl.innerHTML = `
      <tr>
        <td colspan="4" class="roster-error">Could not load the roster. Check your connection and try again.</td>
      </tr>
    `;
  }
}

async function safeLoadRoster() {
  try {
    await loadRoster();
  } catch (error) {
    showLoadFailure(error);
  }
}

async function initializeRoster() {
  const status = $("rosterStatus");
  const protectedContent = document.querySelector("[data-roster-protected]");

  try {
    await requireRosterCoach();
    if (protectedContent) protectedContent.hidden = false;
    if (status) status.hidden = true;
    await safeLoadRoster();
  } catch (error) {
    console.error("[roster] Coach access denied", error);
    if (protectedContent) protectedContent.hidden = true;
    if (status) {
      status.classList.add("is-error");
      status.replaceChildren();
      const message = document.createElement("span");
      message.textContent = "Coach access is required to view the roster. ";
      const link = document.createElement("a");
      link.href = coachLoginUrl();
      link.textContent = "Sign in as Coach";
      status.append(message, link);
    }
  }
}

initializeRoster();

$("journeyFilter")?.addEventListener("change", safeLoadRoster);

$("toggleArchiveView")?.addEventListener("click", () => {
  window.__rosterArchiveView = !window.__rosterArchiveView;
  safeLoadRoster();
});

$("disciplineFilter")?.addEventListener("change", safeLoadRoster);
