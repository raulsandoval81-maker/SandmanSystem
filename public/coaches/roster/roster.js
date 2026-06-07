import {
  db,
  collection,
  getDocs,
  query,
  limit,
  doc,
  updateDoc,
  addDoc,
  serverTimestamp,
  ensureSignedIn
} from "/assets/js/firebase-init.js";

import { renderDigitalBelt } from "/assets/js/digital-belt.js";
import { LADDER_F4, LADDER_F8 } from "/assets/js/ladder.service.js";

const $ = (id) => document.getElementById(id);

let attendanceMode = false;
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

  return Number(tier?.cap ?? data.xpCap ?? data.cap ?? data.tierCap ?? 1200);
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
  return data.publicName || data.fullName || data.name || id;
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

function edgeStatusOf(data = {}) {
  const days = daysSince(data.lastAttendanceAt);
  if (days === null) return "unknown";
  if (days >= 84) return "frozen";
  if (days >= 56) return "edge-loss";
  if (days >= 28) return "at-risk";
  if (days >= 14) return "warning";
  return "active";
}

function edgeChipHtml(data = {}) {
  const status = edgeStatusOf(data);

  if (status === "frozen") return `<span class="status-chip status-chip--freeze">Frozen</span>`;
  if (status === "edge-loss") return `<span class="status-chip status-chip--cooldown">Edge Loss</span>`;
  if (status === "at-risk") return `<span class="status-chip status-chip--watch">At Risk</span>`;
  if (status === "warning") return `<span class="status-chip status-chip--tempo">Warning</span>`;
  if (status === "active") return `<span class="status-chip status-chip--promoted">Active</span>`;

  return `<span class="status-chip">No Attendance</span>`;
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

function updateAttendanceUi() {
  const panel = $("attendancePanel");
  const toggle = $("toggleAttendanceMode");

  if (panel) panel.hidden = !attendanceMode;
  if (toggle) toggle.textContent = attendanceMode ? "Exit Attendance" : "Take Attendance";

  document.querySelectorAll(".attendance-only").forEach((el) => {
    el.hidden = !attendanceMode;
  });

  updatePresentCount();
}

function updatePresentCount() {
  const checked = document.querySelectorAll(".attendance-check:checked").length;
  const presentCount = $("presentCount");
  if (presentCount) presentCount.textContent = `${checked} selected`;
}

async function saveAttendance() {
  const checked = [...document.querySelectorAll(".attendance-check:checked")];

  if (!checked.length) {
    alert("No athletes selected.");
    return;
  }

  const selectedIds = checked.map((item) => item.value);

  const selectedAthletes = currentList
    .filter((a) => selectedIds.includes(a.id))
    .map((a) => ({
      uid: a.id,
      name: athleteName(a.data, a.id)
    }));

  const typeValue = $("practiceType")?.value || "wrestling";
  const coachValue = $("coachName")?.value?.trim() || "Coach";
  const notesValue = $("practiceNotes")?.value?.trim() || "";
  const saveBtn = $("saveAttendance");
  const saveStatus = $("saveStatus");

  if (saveBtn) saveBtn.disabled = true;
  if (saveStatus) saveStatus.textContent = "Saving attendance...";

  try {
    const sessionRef = await addDoc(collection(db, "attendance_sessions"), {
      type: typeValue,
      coach: coachValue,
      notes: notesValue,
      presentCount: selectedAthletes.length,
      present: selectedAthletes,
      presentIds: selectedIds,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });

    for (const athlete of selectedAthletes) {
      await updateDoc(doc(db, "athletes", athlete.uid), {
        lastAttendanceAt: serverTimestamp(),
        lastAttendanceType: typeValue,
        lastAttendanceCoach: coachValue,
        lastAttendanceSessionId: sessionRef.id,
        updatedAt: serverTimestamp()
      });
    }

    if (saveStatus) {
      saveStatus.textContent = `Saved ${selectedAthletes.length} athletes · ${typeValue}`;
    }

    alert(`Attendance saved for ${selectedAthletes.length} athletes.`);
    await loadRoster();
  } catch (err) {
    console.error("[roster attendance] save failed", err);
    if (saveStatus) saveStatus.textContent = "Attendance save failed.";
    alert("Attendance save failed.");
  }

  if (saveBtn) saveBtn.disabled = false;
}

async function loadRoster() {
  await ensureSignedIn();

  const rowsEl = $("rows");
  const countMeta = $("countMeta");
  const archiveBtn = $("toggleArchiveView");
  const f8Only = !!$("trackF8Only")?.checked;

  const track = f8Only ? "F8" : "F4";
  const wantedStatus = isArchiveView() ? "archived" : "current";

  rowsEl.innerHTML = `<tr><td colspan="6" class="muted">Loading…</td></tr>`;

  if (archiveBtn) {
    archiveBtn.textContent = isArchiveView() ? "Current" : "Archived";
  }

  const snap = await getDocs(query(collection(db, "athletes"), limit(500)));

  currentList = snap.docs
    .map((d) => ({
      id: d.id,
      data: d.data() || {}
    }))
    .filter((x) => isLiveRosterAthlete(x.id, x.data))
    .filter((x) => trackBaseOf(x.id, x.data) === track)
    .filter((x) => rosterStatusOf(x.data) === wantedStatus)
    .sort((a, b) =>
      athleteName(a.data, a.id).localeCompare(athleteName(b.data, b.id))
    );

  if (countMeta) {
    countMeta.textContent = `${track} · ${wantedStatus} · ${currentList.length} athletes`;
  }

  rowsEl.innerHTML = currentList.length
    ? currentList.map(({ id, data }) => `
      <tr>
        <td class="attendance-only" data-label="Present" ${attendanceMode ? "" : "hidden"}>
          <input class="attendance-check" type="checkbox" value="${id}">
        </td>

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

        <td data-label="Attendance">
          <div class="xp-sub">Last seen: ${lastSeenText(data)}</div>
          ${!isArchiveView() ? edgeChipHtml(data) : ""}
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
    : `<tr><td colspan="6" class="muted">No athletes found.</td></tr>`;

  document.querySelectorAll(".attendance-check").forEach((box) => {
    box.addEventListener("change", updatePresentCount);
  });

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

    const calculatedStripes = Math.min(stripeMax, Math.floor(xpNow / stripeSize));
    const finalStripes = Math.max(Number(data.stripeCount ?? 0), calculatedStripes);

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
      const xpPercent = Math.min(100, Math.round((xpNow / xpCap) * 100));
      textEl.textContent =
        `${xpNow} / ${xpCap} XP · ${xpPercent}% · Stripes: ${finalStripes} / ${stripeMax}`;
    }
  }

  updateAttendanceUi();
}

loadRoster();

$("trackF8Only")?.addEventListener("change", loadRoster);

$("toggleArchiveView")?.addEventListener("click", () => {
  window.__rosterArchiveView = !window.__rosterArchiveView;
  loadRoster();
});

$("toggleAttendanceMode")?.addEventListener("click", () => {
  attendanceMode = !attendanceMode;
  updateAttendanceUi();
});

$("selectAll")?.addEventListener("click", () => {
  document.querySelectorAll(".attendance-check").forEach((box) => {
    box.checked = true;
  });
  updatePresentCount();
});

$("clearAll")?.addEventListener("click", () => {
  document.querySelectorAll(".attendance-check").forEach((box) => {
    box.checked = false;
  });
  updatePresentCount();
});

$("saveAttendance")?.addEventListener("click", saveAttendance);