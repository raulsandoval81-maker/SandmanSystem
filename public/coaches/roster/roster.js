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

import { updateRankUI } from "/assets/js/belt-bar.js";
import { getStripeInfo, LADDER_F4, LADDER_F8 } from "/assets/js/ladder.service.js";

const $ = (id) => document.getElementById(id);

function trackBaseOf(id, a = {}) {
  if (id.startsWith("F4_")) return "F4";
  if (id.startsWith("F8_")) return "F8";
  return "";
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

/* =========================
   TEMPO / TEMPLE STATUS
========================= */

function getTempoStatus(data = {}, track = "F4") {
  const xp = Number(data.xp || 0);
  const cap = Number(data.xpCap || (track === "F8" ? 600 : 1200));
  const pct = Math.round((xp / (cap || 1)) * 100);

  const testingState = String(data.testing?.state || "").toUpperCase();
// 1️⃣ POST-TEST / PROMOTION STATES OVERRIDE EVERYTHING
if (testingState === "PROMOTED") return "promoted";
if (testingState === "COOLDOWN") return "cooldown";
if (testingState === "FREEZE") return "freeze";

// 2️⃣ TEMPLE (coach-controlled override)
if (testingState === "TEMPLE") return "in-temple";

// 3️⃣ ELIGIBLE = XP at cap (old logic)
if (xp >= cap) return "eligible";

// 4️⃣ WATCH (90–99%)
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

  if (status === "ready") {
    return `<span class="status-chip status-chip--ready">Ready</span>`;
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

/* =========================
   ARCHIVE ACTIONS
========================= */

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

/* =========================
   LOAD ROSTER
========================= */
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
    ? list.map(({ id, data }) => {
        return `
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
                <div id="rankBar-${id}" class="xp-lite-track">
                  <div id="rankFill-${id}" class="xp-lite-fill"></div>
                </div>
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
        `;
      }).join("")
    : `<tr><td colspan="4" class="muted">No athletes found.</td></tr>`;

  /* =========================
     BUTTON HANDLERS
  ========================= */

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

  /* =========================
     BELT RENDER
  ========================= */

  for (const { id, data } of list) {
    const ladder = track === "F8" ? LADDER_F8 : LADDER_F4;
    const totalXP = Number(data.xp || 0);
    const info = getStripeInfo(ladder, totalXP);

    updateRankUI({
      ladder,
      totalXP,
      rankNameOverride: data.rankName || "",
      stripeCountOverride: Number(info.stripesEarned || 0),
      el: {
        barId: `rankBar-${id}`,
        fillId: `rankFill-${id}`,
        textId: `stripeText-${id}`
      }
    });
  }
}

/* =========================
   INIT
========================= */

loadRoster();

$("trackF8Only")?.addEventListener("change", loadRoster);

$("toggleArchiveView")?.addEventListener("click", () => {
  window.__rosterArchiveView = !window.__rosterArchiveView;
  loadRoster();
});