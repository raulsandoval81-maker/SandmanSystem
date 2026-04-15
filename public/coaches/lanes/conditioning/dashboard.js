// /public/coaches/lanes/conditioning/dashboard.js
// Coach Dashboard (read-only): Conditioning submissions

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

function isConditioningKey(key) {
  return /^CON-\d+$/i.test(String(key || ""));
}

function getSessionNumber(key, entry) {
  const direct = Number(entry?.sessionN || 0);
  if (direct > 0) return direct;

  const m = String(key).match(/^CON-(\d+)$/i);
  return m ? Number(m[1]) : 0;
}

function latestConditioningSession(data) {
  const keys = Object.keys(data || {}).filter((k) => {
    const entry = data[k];
    if (!entry || typeof entry !== "object") return false;

    if (!isConditioningKey(k)) return false;
    if (entry.lane && entry.lane !== "conditioning") return false;

    return String(entry?.body || "").trim().length > 0;
  });

  if (!keys.length) return null;

  const items = keys.map((k) => {
    const entry = data[k];
    return {
      key: k,
      n: getSessionNumber(k, entry),
      entry,
    };
  });

  items.sort((a, b) => {
    if (b.n !== a.n) return b.n - a.n;
    return toMillis(b.entry?.submittedAt) - toMillis(a.entry?.submittedAt);
  });

  return items[0];
}

function newestMillis(data) {
  const latest = latestConditioningSession(data);
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

function renderCard({ athleteId, athleteName, data }) {
  const latest = latestConditioningSession(data);

  return `
    <div class="submission-card" style="padding:12px;border:1px solid #27304a;border-radius:14px;background:#111c35;margin-bottom:12px;">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;">
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
          Conditioning • ${latest ? `Session ${latest.n}` : "No Session"}
        </div>

        ${
          latest
            ? `
              <div style="opacity:.7;font-size:.9rem;margin-bottom:6px;">
                Key: ${esc(latest.key)}
                • Submitted: ${esc(safeWhen(latest.entry?.submittedAt))}
                • Status: ${esc(latest.entry?.status || "pending")}
                ${typeof latest.entry?.awardedXp === "number" ? ` • XP: +${latest.entry.awardedXp}` : ""}
              </div>

              <div style="white-space:pre-wrap;line-height:1.45;">
                ${esc(latest.entry?.body || "")}
              </div>

              ${
                latest.entry?.coachNote
                  ? `<div style="margin-top:8px;opacity:.82;font-size:.92rem;">
                      <strong>Coach note:</strong> ${esc(latest.entry.coachNote)}
                    </div>`
                  : ""
              }
            `
            : `<div style="opacity:.65;">No submission.</div>`
        }
      </div>
    </div>
  `;
}

async function loadSubmissions() {
  if (!container) return;

  try {
    const snap = await getDocs(collection(db, "laneSubmissions"));
    const rows = [];

    for (const docSnap of snap.docs) {
      const athleteId = docSnap.id;
      const data = docSnap.data() || {};

      const latest = latestConditioningSession(data);
      if (!latest) continue;

      const athleteName = await getAthleteName(athleteId);

      rows.push({
        athleteId,
        athleteName,
        data,
        t: newestMillis(data),
      });
    }

    rows.sort((a, b) => b.t - a.t);

    container.innerHTML = rows.length
      ? rows.map((r) => renderCard(r)).join("")
      : "No Conditioning submissions yet.";

  } catch (err) {
    console.error("Conditioning dashboard error:", err);
    container.innerHTML = "Error loading submissions.";
  }
}

loadSubmissions();