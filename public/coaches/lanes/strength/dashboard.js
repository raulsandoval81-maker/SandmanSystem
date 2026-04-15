// /public/coaches/lanes/strength/dashboard.js
// Coach Dashboard (read-only): Strength submissions (V1 updated)
//
// Shows:
// - Strength Segment 1: latest submitted session (current STR-### or legacy key)
// - Remote HIIT (legacy support if present)
// - Iron (legacy support if present)
//
// Notes:
// - VIEW ONLY
// - Review / approve / XP stays in review.js

import {
  db,
  ensureSignedIn,
  collection,
  getDocs,
  doc,
  getDoc
} from "/assets/js/firebase-init.js";

await ensureSignedIn();

const container = document.getElementById("submissions-container");

function esc(str = "") {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function domSafe(s = "") {
  return String(s).replace(/[^a-zA-Z0-9_-]/g, "_");
}

function safeWhen(ts) {
  try {
    return ts?.toDate?.().toLocaleString?.() || "Unknown time";
  } catch {
    return "Unknown time";
  }
}

function toMillis(ts) {
  try {
    return ts?.toMillis?.() || 0;
  } catch {
    return 0;
  }
}

function sortLogMapNewestFirst(logMap) {
  const entries = Object.entries(logMap || {});
  entries.sort((a, b) => (a[0] < b[0] ? 1 : -1));
  return entries;
}

function isCurrentStrengthSessionKey(key) {
  return /^STR-\d+$/i.test(String(key || ""));
}

function isLegacyStrengthSessionKey(key) {
  return /^strength_segment1_session\d+$/i.test(String(key || ""));
}

function getSessionNumberFromKey(key, entry) {
  const direct = Number(entry?.sessionN || 0);
  if (direct > 0) return direct;

  const raw = String(key || "");

  let m = raw.match(/^STR-(\d+)$/i);
  if (m) return Number(m[1]) || 0;

  m = raw.match(/session(\d+)$/i);
  if (m) return Number(m[1]) || 0;

  return 0;
}

function latestStrengthSession(data) {
  const keys = Object.keys(data || {}).filter((k) => {
    const entry = data[k];
    if (!entry || typeof entry !== "object") return false;

    const isSessionKey = isCurrentStrengthSessionKey(k) || isLegacyStrengthSessionKey(k);
    if (!isSessionKey) return false;

    if (entry.lane && String(entry.lane).toLowerCase() !== "strength") return false;

    return String(entry?.body || "").trim().length > 0;
  });

  if (!keys.length) return null;

  const items = keys.map((k) => {
    const entry = data[k] || {};
    return {
      key: k,
      n: getSessionNumberFromKey(k, entry),
      entry,
    };
  });

  items.sort((a, b) => {
    if (b.n !== a.n) return b.n - a.n;
    return toMillis(b.entry?.submittedAt) - toMillis(a.entry?.submittedAt);
  });

  return items[0] || null;
}

function fmtIron(entry) {
  if (!entry) return `<div style="opacity:.7;">No Iron log yet.</div>`;

  const top = `${entry.topSetReps || "?"}x${entry.topSetWeight || "?"}${entry.unit || "lb"}`;

  return `
    <div style="display:grid;gap:.25rem;">
      <div><b>Phase:</b> ${esc(entry.phase || "")} • <b>Day:</b> ${esc(String(entry.day || ""))}</div>
      <div><b>Top Move:</b> ${esc(entry.topMovement || "")} • <b>Top Set:</b> ${esc(top)}</div>
      <div><b>Completed:</b> ${entry.completedPrescribedWork ? "Yes" : "No"}</div>
      <div style="opacity:.85;"><b>Note:</b> ${esc(entry.note || "")}</div>
      <div style="opacity:.7;"><b>Submitted:</b> ${esc(safeWhen(entry.submittedAt))}</div>
      <div style="opacity:.7;"><b>Status:</b> ${esc(entry.status || "pending")}</div>
    </div>
  `;
}

function fmtHIIT(entry) {
  if (!entry) return `<div style="opacity:.7;">No Remote HIIT submission yet.</div>`;

  const interval = entry.interval
    ? `${entry.interval.workSec || "?"}s on / ${entry.interval.restSec || "?"}s off`
    : "Unknown interval";

  return `
    <div style="display:grid;gap:.25rem;">
      <div><b>Level:</b> ${esc(entry.levelLabel || entry.levelId || "")}</div>
      <div><b>Period:</b> ${esc(String(entry.periodMinutes || ""))} min • <b>Moves:</b> ${esc(String(entry.movesPerPeriod || ""))} • <b>Periods:</b> ${esc(String(entry.periods || ""))}</div>
      <div><b>Interval:</b> ${esc(interval)} • <b>Reset:</b> ${esc(String(Math.round((entry.resetBetweenPeriodsSec || 120) / 60)))} min</div>
      <div><b>Best Round:</b> ${esc(entry.bestRound || entry.best || "")}</div>
      ${entry.notes ? `<div style="opacity:.85;"><b>Notes:</b> ${esc(entry.notes)}</div>` : ""}
      <div style="opacity:.7;"><b>Submitted:</b> ${esc(safeWhen(entry.submittedAt))}</div>
      <div style="opacity:.7;"><b>Status:</b> ${esc(entry.status || "pending")}</div>
    </div>
  `;
}

function newestActivityMillis(data) {
  const latest = latestStrengthSession(data);
  const t1 = latest ? toMillis(latest.entry?.submittedAt) : 0;
  const t2 = toMillis(data?.strength_remote_hiit?.submittedAt);
  const t3 = toMillis(data?.strength_iron_latest?.submittedAt);
  return Math.max(t1, t2, t3);
}

async function getAthleteName(athleteId) {
  try {
    const snap = await getDoc(doc(db, "athletes", athleteId));
    if (!snap.exists()) return athleteId;

    const data = snap.data() || {};
    return data.fullName || data.athleteName || data.name || athleteId;
  } catch {
    return athleteId;
  }
}

function renderAthleteCard({ athleteId, athleteName, data }) {
  const latest = latestStrengthSession(data);
  const hiit = data?.strength_remote_hiit || null;
  const ironLatest = data?.strength_iron_latest || null;
  const ironLogs = data?.strength_iron_logs || {};
  const ironSorted = sortLogMapNewestFirst(ironLogs);
  const ironCount = ironSorted.length;

  const safeAthleteId = domSafe(athleteId);
  const toggleId = `ironToggle_${safeAthleteId}`;
  const panelId = `ironPanel_${safeAthleteId}`;

  return `
    <div class="submission-card" style="padding:12px;border:1px solid #27304a;border-radius:14px;background:#111c35;margin-bottom:12px;">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;">
        <div>
          <div style="font-weight:900;font-size:1.05rem;">
            ${esc(athleteName || athleteId)}
          </div>
          <div style="opacity:.6;font-size:.8rem;">
            ${esc(athleteName ? athleteId : "")}
          </div>
        </div>

        <div style="opacity:.7;font-size:.9rem;">laneSubmissions/${esc(athleteId)}</div>
      </div>

      <div style="margin-top:10px;padding:10px;border:1px solid #1f2937;border-radius:12px;background:#0b1017;">
        <div style="font-weight:900;margin-bottom:6px;">
          Strength • Segment 1 • ${latest ? `Session ${latest.n}` : "No Session"}
        </div>

        ${
          latest
            ? `
              <div style="opacity:.7;font-size:.9rem;margin-bottom:6px;">
                Key: ${esc(latest.key)}
                • Submitted: ${esc(safeWhen(latest.entry?.submittedAt))}
                • Status: ${esc(latest.entry?.status || "pending")}
                ${typeof latest.entry?.awardedXp === "number" ? ` • XP: +${esc(String(latest.entry.awardedXp))}` : ""}
              </div>

              <div style="white-space:pre-wrap;line-height:1.45;">${esc(latest.entry?.body || "")}</div>

              ${
                latest.entry?.baselineResults
                  ? `
                    <div style="margin-top:8px;opacity:.82;font-size:.92rem;">
                      <strong>Baseline Results:</strong>
                      <div style="margin-top:4px;white-space:pre-wrap;">
${esc(
  Object.entries(latest.entry.baselineResults)
    .map(([k, v]) => `${k}: ${v}`)
    .join("\n")
)}
                      </div>
                    </div>
                  `
                  : ""
              }

              ${
                latest.entry?.coachNote
                  ? `<div style="margin-top:8px;opacity:.82;font-size:.92rem;"><strong>Coach note:</strong> ${esc(latest.entry.coachNote)}</div>`
                  : ""
              }
            `
            : `<div style="opacity:.65;">No submission.</div>`
        }
      </div>

      <div style="margin-top:10px;padding:10px;border:1px solid #1f2937;border-radius:12px;background:#0b1017;">
        <div style="font-weight:900;margin-bottom:6px;">Strength • Remote HIIT</div>
        ${fmtHIIT(hiit)}
      </div>

      <div style="margin-top:10px;padding:10px;border:1px solid #1f2937;border-radius:12px;background:#0b1017;">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;">
          <div style="font-weight:900;">Strength • Iron Room</div>
          <button
            id="${toggleId}"
            data-open="0"
            style="padding:.35rem .7rem;border-radius:10px;border:1px solid #27304a;background:#111c35;color:#e8eef7;cursor:pointer;"
          >
            Show History (${ironCount})
          </button>
        </div>

        <div style="margin-top:8px;">
          <div style="opacity:.75;font-weight:800;margin-bottom:4px;">Latest</div>
          ${fmtIron(ironLatest)}
        </div>

        <div id="${panelId}" style="display:none;margin-top:10px;">
          <div style="opacity:.75;font-weight:800;margin-bottom:4px;">History (last 10)</div>
          ${
            ironCount
              ? ironSorted.slice(0, 10).map(([k, v]) => `
                  <div style="margin-top:8px;padding:10px;border:1px solid #1f2937;border-radius:12px;background:#111c35;">
                    <div style="opacity:.7;font-size:.9rem;margin-bottom:6px;"><b>${esc(k)}</b></div>
                    ${fmtIron(v)}
                  </div>
                `).join("")
              : `<div style="opacity:.65;">No history yet.</div>`
          }
        </div>
      </div>
    </div>
  `;
}

function bindToggles(root = document) {
  const buttons = root.querySelectorAll('button[id^="ironToggle_"]');
  buttons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const safeAthleteId = btn.id.replace("ironToggle_", "");
      const panel = document.getElementById(`ironPanel_${safeAthleteId}`);
      if (!panel) return;

      const open = btn.getAttribute("data-open") === "1";
      const nextOpen = !open;

      panel.style.display = nextOpen ? "block" : "none";
      btn.setAttribute("data-open", nextOpen ? "1" : "0");

      const base = btn.textContent.replace(/^(Show|Hide)\s+/, "");
      btn.textContent = (nextOpen ? "Hide " : "Show ") + base;
    });
  });
}

async function loadSubmissions() {
  if (!container) return;

  try {
    const snap = await getDocs(collection(db, "laneSubmissions"));

    if (snap.empty) {
      container.innerHTML = "No submissions found.";
      return;
    }

    const rows = [];

    for (const docSnap of snap.docs) {
      const athleteId = docSnap.id;
      const data = docSnap.data() || {};

      const latest = latestStrengthSession(data);

      const hasStrength =
        !!latest ||
        !!data.strength_remote_hiit ||
        !!data.strength_iron_latest ||
        !!(data.strength_iron_logs && Object.keys(data.strength_iron_logs).length);

      if (!hasStrength) continue;

      const athleteName = await getAthleteName(athleteId);

      rows.push({
        athleteId,
        athleteName,
        data,
        t: newestActivityMillis(data),
      });
    }

    rows.sort((a, b) => b.t - a.t);

    container.innerHTML = rows.length
      ? rows.map((r) => renderAthleteCard(r)).join("")
      : "No Strength submissions yet.";

    bindToggles(container);
  } catch (err) {
    console.error("Strength dashboard error:", err);
    container.innerHTML = "Error loading submissions.";
  }
}

loadSubmissions();