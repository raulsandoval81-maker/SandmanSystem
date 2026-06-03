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

function trackBaseOf(id, a = {}) {
  if (id.startsWith("F4_")) return "F4";
  if (id.startsWith("F8_")) return "F8";
  return "";
}

function xpCapForAthlete(data = {}, track = "F4") {
  const ladder = track === "F8" ? LADDER_F8 : LADDER_F4;
  const rankName = data.rankName || data.tierName;

  const tier =
    ladder.find((t) => t.name === rankName) ||
    ladder[0];

  return Number(
    tier?.cap ??
    data.xpCap ??
    data.cap ??
    data.tierCap ??
    1200
  );
}

function rosterStatusOf(a = {}) {
  return a.rosterStatus || "current";
}

function isArchiveView() {
  return !!window.__rosterArchiveView;
}

function isLiveRosterAthlete(id, a = {}) {
  if (!id) return false;
  if (a.devMode === true || a.isDev === true || a.isTest === true) return false;
  return true;
}

function athleteName(data = {}, id = "") {
  return data.publicName || data.fullName || id;
}

function getTempoStatus(data = {}, track = "F4") {
  const xp = Number(data.xp || 0);
  const cap = xpCapForAthlete(data, track);
  const pct = Math.round((xp / (cap || 1)) * 100);

  const testingState = String(data.testing?.state || "").toUpperCase();

  if (testingState === "PROMOTED") return "promoted";
  if (testingState === "COOLDOWN") return "cooldown";
  if (testingState === "FREEZE") return "freeze";
  if (testingState === "TEMPLE") return "in-temple";
  if (xp >= cap) return "eligible";
  if (pct >= 90 && xp < cap) return "temple-watch";

  return "";
}

function tempoChipHtml(data = {}, track = "F4") {
  const status = getTempoStatus(data, track);

  if (status === "promoted") return `<span class="status-chip status-chip--promoted">Promoted</span>`;
  if (status === "cooldown") return `<span class="status-chip status-chip--cooldown">Cooldown</span>`;
  if (status === "freeze") return `<span class="status-chip status-chip--freeze">Freeze</span>`;
  if (status === "in-temple") return `<span class="status-chip status-chip--tempo">In Temple</span>`;
  if (status === "temple-watch") return `<span class="status-chip status-chip--watch">Temple Watch</span>`;
  if (status === "eligible") return `<span class="status-chip status-chip--eligible">Eligible</span>`;

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
  const f8Only = !!$("trackF8Only")?.checked;

  const track = f8Only ? "F8" : "F4";
  const wantedStatus = isArchiveView() ? "archived" : "current";

  rowsEl.innerHTML = `<tr><td colspan="4" class="muted">Loading…</td></tr>`;

  if (archiveBtn) {
    archiveBtn.textContent = isArchiveView() ? "Current" : "Archived";
  }

  const snap = await getDocs(query(collection(db, "athletes"), limit(500)));

  let list = snap.docs.map((d) => ({
    id: d.id,
    data: d.data() || {}
  }));

  list = list
    .filter((x) => isLiveRosterAthlete(x.id, x.data))
    .filter((x) => trackBaseOf(x.id, x.data) === track)
    .filter((x) => rosterStatusOf(x.data) === wantedStatus)
    .sort((a, b) =>
      athleteName(a.data, a.id).localeCompare(athleteName(b.data, b.id))
    );

  if (countMeta) {
    countMeta.textContent = `${track} · ${wantedStatus} · ${list.length} athletes`;
  }

  rowsEl.innerHTML = list.length
    ? list.map(({ id, data }) => `
      <tr>
        <td data-label="Athlete">
          <div class="name-col">
            <div class="name-line">
              ${athleteName(data, id)}
              ${!isArchiveView() ? tempoChipHtml(data, track) : ""}
            </div>
          </div>
        </td>

        <td data-label="Tier / Rank">${data.rankName || "—"}</td>

        <td data-label="XP">
          <div class="belt-stack">
            <div id="rankBar-${id}" class="mini-belt-slot"></div>
            <div id="stripeText-${id}" class="xp-sub"></div>
          </div>
        </td>

        <td data-label="Actions">
          <div class="roster-actions">
            <a class="pill" href="/athletes/profile/athlete-profile.html?id=${encodeURIComponent(id)}">
              Profile
            </a>
            ${
              isArchiveView()
                ? `<button class="pill" type="button" data-restore="${id}">Restore</button>`
                : `<button class="pill" type="button" data-archive="${id}">Archive</button>`
            }
          </div>
        </td>
      </tr>
    `).join("")
    : `<tr><td colspan="4" class="muted">No athletes found.</td></tr>`;

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

  for (const { id, data } of list) {
    const ladder = track === "F8" ? LADDER_F8 : LADDER_F4;
    const tier = ladder.find((t) => t.name === data.rankName) || ladder[0];

    const xpNow = Number(data.xp ?? data.currentTierXP ?? 0);
    const xpCap = xpCapForAthlete(data, track);
    const stripeMax = Number(tier.stripes ?? 4);
    const stripeSize = Number(tier.stripe ?? (xpCap / stripeMax));

    const calculatedStripes = Math.min(
      stripeMax,
      Math.floor(xpNow / stripeSize)
    );

    const finalStripes = Math.max(
      Number(data.stripeCount ?? 0),
      calculatedStripes
    );

    const colorMapF4 = {
      Apprentice: "belt-white",
      Warrior: "belt-blue",
      Champion: "belt-purple",
      Veteran: "belt-brown",
      Legend: "belt-black"
    };

    const colorMapF8 = {
      Shadow: "belt-white",
      Recruit: "belt-yellow",
      Combatant: "belt-orange",
      Competitor: "belt-green",
      Warrior: "belt-blue",
      Champion: "belt-purple",
      Commander: "belt-brown",
      Hero: "belt-black"
    };

    const colorClass =
      track === "F8"
        ? colorMapF8[data.rankName] || "belt-white"
        : colorMapF4[data.rankName] || "belt-white";

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

$("trackF8Only")?.addEventListener("change", loadRoster);

$("toggleArchiveView")?.addEventListener("click", () => {
  window.__rosterArchiveView = !window.__rosterArchiveView;
  loadRoster();
});