// /public/coaches/lanes/honor/dashboard.js
// Coach Dashboard (read-only): Honor submissions (V1 updated)
//
// Mirrors Strength dashboard styling/layout.
// Shows:
// - Latest valid Honor session across current canonical and legacy keys
//
// VIEW ONLY. No XP award, no status changes.

import {
  db,
  ensureSignedIn,
  collection,
  getDocs,
  doc,
  getDoc
} from "/assets/js/firebase-init.js";
import { resolveLaneSubmissionIdentity } from "/assets/js/athlete-lane-context.js";

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

function getSessionNumberFromKey(key, entry) {
  return resolveLaneSubmissionIdentity({ lane: "honor", entry, key }).sessionN || 0;
}

function latestHonorSession(data) {
  const keys = Object.keys(data || {}).filter((k) => {
    const entry = data[k];
    if (!entry || typeof entry !== "object") return false;

    const identity = resolveLaneSubmissionIdentity({ lane: "honor", entry, key: k });
    if (!identity.segmentId || !identity.sessionN) return false;

    if (entry.lane && String(entry.lane).toLowerCase() !== "honor") return false;

    return String(entry?.body || "").trim().length > 0;
  });

  if (!keys.length) return null;

  const items = keys.map((k) => {
    const entry = data[k] || {};
    return {
      key: k,
      n: getSessionNumberFromKey(k, entry),
      segmentId: resolveLaneSubmissionIdentity({ lane: "honor", entry, key: k }).segmentId,
      entry,
    };
  });

  items.sort((a, b) => {
    if (b.n !== a.n) return b.n - a.n;
    return toMillis(b.entry?.submittedAt) - toMillis(a.entry?.submittedAt);
  });

  return items[0] || null;
}

function newestHonorMillis(data) {
  const latest = latestHonorSession(data);
  return latest ? toMillis(latest.entry?.submittedAt) : 0;
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
  const latest = latestHonorSession(data);
  const latestSegment = Number(latest?.segmentId?.replace("segment", "")) || "?";

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
          Honor • Segment ${esc(String(latestSegment))} • ${latest ? `Session ${latest.n}` : "No Session"}
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
                latest.entry?.coachNote
                  ? `<div style="margin-top:8px;opacity:.82;font-size:.92rem;"><strong>Coach note:</strong> ${esc(latest.entry.coachNote)}</div>`
                  : ""
              }
            `
            : `<div style="opacity:.65;">No Honor submission.</div>`
        }
      </div>
    </div>
  `;
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

      const latest = latestHonorSession(data);
      if (!latest) continue;

      const athleteName = await getAthleteName(athleteId);

      rows.push({
        athleteId,
        athleteName,
        data,
        t: newestHonorMillis(data),
      });
    }

    rows.sort((a, b) => b.t - a.t);

    container.innerHTML = rows.length
      ? rows.map((r) => renderAthleteCard(r)).join("")
      : "No Honor submissions yet.";
  } catch (err) {
    console.error("Honor dashboard error:", err);
    container.innerHTML = "Error loading submissions.";
  }
}

loadSubmissions();
