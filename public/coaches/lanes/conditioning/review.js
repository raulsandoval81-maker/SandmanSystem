import {
  db,
  ensureSignedIn,
  collection,
  getDocs,
  doc,
  updateDoc,
  setDoc,
  serverTimestamp,
  getDoc,
} from "/assets/js/firebase-init.js";

import { XP_URL } from "/assets/js/coach-endpoints.js";

await ensureSignedIn();

const container = document.getElementById("submissions-container");
const requestsContainer = document.getElementById("requests-container");

function esc(str = "") {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function keySafe(s = "") {
  return String(s).replaceAll(/[^a-zA-Z0-9_-]/g, "_");
}

function safeWhen(ts) {
  try {
    return ts?.toDate?.().toLocaleString?.() || "Unknown time";
  } catch {
    return "Unknown time";
  }
}

function coachUid() {
  return window.COACH_UID || localStorage.getItem("coachUid") || "DEV_COACH";
}

function badge(status = "pending") {
  const s = String(status || "pending").toLowerCase();
  const base =
    "display:inline-flex;align-items:center;gap:6px;padding:.18rem .55rem;border-radius:999px;font-weight:900;font-size:.78rem;border:1px solid #27304a;";

  if (s === "approved") {
    return `<span style="${base}background:rgba(34,197,94,.15);border-color:rgba(34,197,94,.35);color:#86efac;">APPROVED</span>`;
  }

  if (s === "needs_revision") {
    return `<span style="${base}background:rgba(239,68,68,.12);border-color:rgba(239,68,68,.35);color:#fca5a5;">REVISION</span>`;
  }

  if (s === "closed") {
    return `<span style="${base}background:rgba(148,163,184,.12);border-color:rgba(148,163,184,.35);color:#cbd5e1;">CLOSED</span>`;
  }

  if (s === "assigned") {
    return `<span style="${base}background:rgba(59,130,246,.12);border-color:rgba(59,130,246,.35);color:#93c5fd;">ASSIGNED</span>`;
  }

  return `<span style="${base}background:rgba(245,158,11,.12);border-color:rgba(245,158,11,.35);color:#fdba74;">PENDING</span>`;
}

function btnStyle(kind = "brand") {
  const base =
    "padding:.45rem .7rem;border-radius:10px;border:1px solid #27304a;background:#0b1017;color:#e8eef7;cursor:pointer;font-weight:900;";

  if (kind === "brand") {
    return base + "background:#ffdd48;color:#000;border-color:#ffdd48;";
  }

  if (kind === "ok") return base + "border-color:rgba(34,197,94,.6);";
  if (kind === "danger") return base + "border-color:rgba(239,68,68,.6);";
  if (kind === "muted") return base + "border-color:rgba(148,163,184,.45);color:#cbd5e1;";
  return base;
}

function parseFunctionJson(raw) {
  return raw?.result ?? raw?.data ?? raw;
}

function setCardBusy(safeId, busy = true, message = "Working…") {
  const card = document.querySelector(`[data-card="${safeId}"]`);
  const msgEl = document.getElementById(`msg_${safeId}`);
  if (!card) return;

  const buttons = card.querySelectorAll("button[data-act]");
  buttons.forEach((b) => {
    const locked = b.hasAttribute("data-award-locked");
    b.disabled = busy || locked;
  });

  if (msgEl) msgEl.textContent = busy ? message : "";
}

async function awardXp({ athleteId, amount, note = "", meta = {} }) {
  const payload = {
    uid: athleteId,
    kind: "STRENGTH",
    amount: Number(amount) || 0,
    lane: "conditioning",
    meta: {
      lane: "conditioning",
      source: "lane-review",
      note: note || "",
      ...meta,
    },
  };

  const res = await fetch(XP_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-coach-uid": String(coachUid()).trim(),
    },
    body: JSON.stringify({ data: payload }),
  });

  const text = await res.text().catch(() => "");

  if (!res.ok) {
    throw new Error(`HTTP ${res.status}${text ? " · " + text : ""}`);
  }

  let raw = null;
  try {
    raw = text ? JSON.parse(text) : null;
  } catch {
    raw = null;
  }

  const data = parseFunctionJson(raw) || {};
  if (!data.ok) {
    throw new Error(`XP not ok${text ? " · " + text : ""}`);
  }

  return data;
}

async function patchSession({ athleteId, key, patch }) {
  const ref = doc(db, "laneSubmissions", athleteId);

  const payload = {
    [`${key}.reviewedAt`]: serverTimestamp(),
    [`${key}.reviewedBy`]: String(coachUid()).trim(),
  };

  Object.entries(patch || {}).forEach(([field, value]) => {
    payload[`${key}.${field}`] = value;
  });

  await updateDoc(ref, payload);
}

async function writeLaneHistory({ athleteId, athleteName, key, entry, coachNote = "" }) {
  const historyId = `${athleteId}__${key}`;
  const historyRef = doc(db, "laneHistory", historyId);

  const sessionN = Number(entry?.sessionN || 0);

  await setDoc(historyRef, {
    athleteId,
    athleteName: athleteName || "",
    lane: "conditioning",
    track: entry?.track || "",
    segmentId: entry?.segmentId || "segment1",
    segment: 1,
    sessionN,
    session: sessionN,

    status: "closed",

    body: entry?.body || "",
    notes: entry?.body || "",
    submissionText: entry?.body || "",

    coachNote: coachNote || entry?.coachNote || "",
    awardedXp: Number(entry?.awardedXp || 0),

    title: entry?.title || "",
    level: entry?.level || "",
    interval: entry?.interval || null,
    rounds: Number(entry?.rounds || 0),
    movesPerCycle: Number(entry?.movesPerCycle || 0),
    sequence: Array.isArray(entry?.sequence) ? entry.sequence : [],

    submittedAt: entry?.submittedAt || null,
    reviewedAt: entry?.reviewedAt || null,
    closedAt: serverTimestamp(),

    sourceCollection: "laneSubmissions",
    sourceAthleteId: athleteId,
    sourceKey: key,
    historyType: "submission"
  }, { merge: true });
}

function renderRequestCard({ athleteId, athleteName, req, assignment }) {
  const safeId = keySafe(`${athleteId}__conditioning_request`);
  const currentPreset = String(assignment?.presetId || "").trim();

  return `
    <div
      class="submission-card"
      data-card="${safeId}"
      style="padding:12px;border:1px solid #27304a;border-radius:14px;background:#111c35;margin-bottom:12px;"
    >
      <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;">
        <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
          <div style="font-weight:900;font-size:1.05rem;">
            ${esc(athleteName || athleteId)}
          </div>
          <div style="opacity:.6;font-size:.8rem;">
            ${esc(athleteName ? athleteId : "")}
          </div>
          ${badge(req?.status || "pending")}
          <span style="opacity:.75;font-size:.85rem;">
            Source: ${esc(req?.sourceLane || "strength")} · Session ${esc(String(req?.sourceSessionN || "?"))}
          </span>
        </div>
        <div style="opacity:.7;font-size:.9rem;">Requested: ${esc(safeWhen(req?.requestedAt))}</div>
      </div>

      <div style="margin-top:10px;padding:10px;border:1px solid #1f2937;border-radius:12px;background:#0b1017;">
        <div style="font-weight:900;margin-bottom:6px;">Athlete Request</div>
        <div style="white-space:pre-wrap;line-height:1.45;">${esc(req?.note || "No note provided.")}</div>
      </div>

      <div style="margin-top:10px;display:grid;gap:8px;">
        <label style="display:grid;gap:4px;">
          <span style="opacity:.75;font-size:.9rem;">Assign preset</span>
          <select
            id="preset_${safeId}"
            style="padding:.65rem;border-radius:10px;border:1px solid #27304a;background:#0b1017;color:#e8eef7;"
          >
            <option value="">Select preset</option>
            <option value="F4_REMOTE_BASE" ${currentPreset === "F4_REMOTE_BASE" ? "selected" : ""}>F4 Remote Base</option>
            <option value="F4_REMOTE_PRESSURE" ${currentPreset === "F4_REMOTE_PRESSURE" ? "selected" : ""}>F4 Remote Pressure</option>
            <option value="F8_FOUNDATION" ${currentPreset === "F8_FOUNDATION" ? "selected" : ""}>F8 Foundation</option>
            <option value="F8_BUILD" ${currentPreset === "F8_BUILD" ? "selected" : ""}>F8 Build</option>
          </select>
        </label>

        <label style="display:grid;gap:4px;">
          <span style="opacity:.75;font-size:.9rem;">Coach note</span>
          <textarea
            id="request_note_${safeId}"
            placeholder="Optional support only. Iron day must still be made up."
            style="min-height:90px;padding:.65rem;border-radius:10px;border:1px solid #27304a;background:#0b1017;color:#e8eef7;resize:vertical;font:inherit;line-height:1.45;"
          >${esc(assignment?.note || "Optional support only. Iron day must still be made up.")}</textarea>
        </label>

        <div style="display:flex;flex-wrap:wrap;gap:8px;">
          <button
            data-request-act="assign"
            data-id="${esc(athleteId)}"
            style="${btnStyle("brand")}"
          >Assign Workout</button>

          <button
            data-request-act="clear"
            data-id="${esc(athleteId)}"
            style="${btnStyle("muted")}"
          >Clear Request</button>
        </div>

        <div id="msg_${safeId}" style="opacity:.75;font-size:.9rem;"></div>
      </div>
    </div>
  `;
}

function renderCard({ athleteId, athleteName, key, entry }) {
  const status = entry?.status || "pending";
  const submittedAt = safeWhen(entry?.submittedAt);
  const body = entry?.body || "";
  const coachNote = entry?.coachNote || "";
  const awardedXp = entry?.awardedXp;
  const awardLocked = typeof awardedXp === "number" && awardedXp > 0;

  const safeId = keySafe(`${athleteId}__${key}`);
  const sessionN = Number(entry?.sessionN || 0);
  const track = String(entry?.track || "").toUpperCase();

  return `
    <div
      class="submission-card"
      data-card="${safeId}"
      style="padding:12px;border:1px solid #27304a;border-radius:14px;background:#111c35;margin-bottom:12px;"
    >
      <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;">
        <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
          <div style="font-weight:900;font-size:1.05rem;">
            ${esc(athleteName || athleteId)}
          </div>
          <div style="opacity:.6;font-size:.8rem;">
            ${esc(athleteName ? athleteId : "")}
          </div>
          ${badge(status)}
          <span style="opacity:.75;font-size:.85rem;">${esc(track)} · Session ${esc(String(sessionN || "?"))}</span>
          <span style="opacity:.75;font-size:.85rem;">${esc(entry?.level || "")}</span>
          ${awardLocked ? `<span style="opacity:.75;font-size:.85rem;">XP: +${awardedXp}</span>` : ""}
        </div>
        <div style="opacity:.7;font-size:.9rem;">Submitted: ${esc(submittedAt)}</div>
      </div>

      <div style="margin-top:10px;display:grid;grid-template-columns:1fr;gap:10px;">
        <div style="padding:10px;border:1px solid #1f2937;border-radius:12px;background:#0b1017;">
          <div style="font-weight:900;margin-bottom:6px;">
            ${esc(entry?.title || `Conditioning Session ${sessionN}`)}
          </div>
          <div style="opacity:.78;font-size:.9rem;margin-bottom:8px;">
            Interval: ${esc(String(entry?.interval?.workSec || "?"))}/${esc(String(entry?.interval?.restSec || "?"))}
            · Rounds: ${esc(String(entry?.rounds || ""))}
            · Moves: ${esc(String(entry?.movesPerCycle || ""))}
          </div>
          ${
            Array.isArray(entry?.sequence) && entry.sequence.length
              ? `<div style="margin-bottom:8px;"><b>Sequence:</b> ${esc(entry.sequence.join(" • "))}</div>`
              : ""
          }
          <div style="opacity:.72;font-size:.85rem;margin-bottom:8px;">Athlete response</div>
          <div style="white-space:pre-wrap;line-height:1.45;">${esc(body)}</div>
        </div>
      </div>

      <div style="margin-top:10px;display:grid;gap:8px;">
        <label style="display:grid;gap:4px;">
          <span style="opacity:.75;font-size:.9rem;">Coach response</span>
          <textarea
            id="note_${safeId}"
            placeholder="Respond to the athlete here…"
            style="min-height:120px;padding:.65rem;border-radius:10px;border:1px solid #27304a;background:#0b1017;color:#e8eef7;resize:vertical;font:inherit;line-height:1.45;"
          >${esc(coachNote)}</textarea>
        </label>

        <div style="display:flex;flex-wrap:wrap;gap:8px;">
          <button
            data-act="approve"
            data-id="${esc(athleteId)}"
            data-key="${esc(key)}"
            style="${btnStyle("ok")}"
          >Approve</button>

          <button
            data-act="revision"
            data-id="${esc(athleteId)}"
            data-key="${esc(key)}"
            style="${btnStyle("danger")}"
          >Needs Revision</button>

          <span style="flex:1;"></span>

          <button
            data-act="xp5"
            data-id="${esc(athleteId)}"
            data-key="${esc(key)}"
            ${awardLocked ? "disabled data-award-locked" : ""}
            style="${btnStyle("brand")}opacity:${awardLocked ? ".4" : "1"};"
          >Award +5</button>
        </div>

        <div id="msg_${safeId}" style="opacity:.75;font-size:.9rem;"></div>
      </div>
    </div>
  `;
}

async function loadRequests() {
  if (!requestsContainer) return;

  try {
    const snap = await getDocs(collection(db, "laneSubmissions"));
    const rows = [];

    snap.forEach((docSnap) => {
      const athleteId = docSnap.id;
      const data = docSnap.data() || {};

      const req = data?.conditioning_request || null;
      const assignment = data?.conditioning_assignment || null;
      const athleteName =
        data?.conditioning_request?.athleteName ||
        data?.conditioning_assignment?.athleteName ||
        data?.athleteName ||
        "";

      if (!req) return;
      if (String(req.status || "").toLowerCase() !== "pending") return;

      rows.push({
        athleteId,
        athleteName,
        req,
        assignment,
      });
    });

    requestsContainer.innerHTML = rows.length
      ? rows.map((r) => renderRequestCard(r)).join("")
      : `<div class="empty">No pending conditioning requests.</div>`;

    wireRequestButtons();
  } catch (err) {
    console.error("Conditioning request load error:", err);
    if (requestsContainer) {
      requestsContainer.innerHTML = `<div class="empty">Error loading conditioning requests.</div>`;
    }
  }
}

function wireRequestButtons() {
  document.querySelectorAll("button[data-request-act][data-id]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const act = btn.getAttribute("data-request-act");
      const athleteId = btn.getAttribute("data-id");
      const safeId = keySafe(`${athleteId}__conditioning_request`);
      const msgEl = document.getElementById(`msg_${safeId}`);

      try {
        const presetEl = document.getElementById(`preset_${safeId}`);
        const noteEl = document.getElementById(`request_note_${safeId}`);

        const presetId = String(presetEl?.value || "").trim();
        const coachNote = String(noteEl?.value || "").trim();

        const ref = doc(db, "laneSubmissions", athleteId);
        const snap = await getDoc(ref);
        const data = snap.exists() ? snap.data() || {} : {};
        const req = data?.conditioning_request || {};

        if (act === "assign") {
          if (!presetId) {
            if (msgEl) msgEl.textContent = "Select a preset first.";
            return;
          }

          await updateDoc(ref, {
            conditioning_assignment: {
              status: "assigned",
              assignedAt: serverTimestamp(),
              assignedBy: String(coachUid()).trim(),
              lane: "conditioning",
              sourceLane: req?.sourceLane || "strength",
              sourceSessionN: Number(req?.sourceSessionN || 0),
              presetId,
              note: coachNote || "Optional support only. Iron day must still be made up.",
            },
            "conditioning_request.status": "assigned",
            "conditioning_request.assignedAt": serverTimestamp(),
          });

          if (msgEl) msgEl.textContent = "Workout assigned.";
        }

        if (act === "clear") {
          await updateDoc(ref, {
            "conditioning_request.status": "closed",
            "conditioning_request.closedAt": serverTimestamp(),
          });

          if (msgEl) msgEl.textContent = "Request cleared.";
        }

        await loadRequests();
      } catch (err) {
        console.error("Conditioning request action error:", err);
        if (msgEl) msgEl.textContent = `Error: ${err?.message || "see console"}`;
      }
    });
  });
}

async function loadSubmissions() {
  if (!container) return;

  try {
    const snap = await getDocs(collection(db, "laneSubmissions"));
    const rows = [];

    snap.forEach((docSnap) => {
      const athleteId = docSnap.id;
      const data = docSnap.data() || {};

      Object.keys(data).forEach((k) => {
        const entry = data[k];
        if (!entry || typeof entry !== "object") return;
        if (String(entry.lane || "").toLowerCase() !== "conditioning") return;
        if (!(entry?.body || "").trim()) return;
        if (entry.status === "closed") return;

        rows.push({
          athleteId,
          athleteName: entry?.athleteName || "",
          key: k,
          entry
        });
      });
    });

    rows.sort((a, b) => {
      const ta = a.entry?.submittedAt?.toMillis?.() || 0;
      const tb = b.entry?.submittedAt?.toMillis?.() || 0;
      return tb - ta;
    });

    container.innerHTML = rows.length
      ? rows.map((r) => renderCard(r)).join("")
      : `<div class="empty">No Conditioning submissions in active review.</div>`;

    container.querySelectorAll("button[data-act][data-id][data-key]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const act = btn.getAttribute("data-act");
        const athleteId = btn.getAttribute("data-id");
        const key = btn.getAttribute("data-key");

        const safeId = keySafe(`${athleteId}__${key}`);
        const noteEl = document.getElementById(`note_${safeId}`);
        const msgEl = document.getElementById(`msg_${safeId}`);
        const coachNote = (noteEl?.value || "").trim();

        setCardBusy(safeId, true, "Working…");

        try {
          const currentRow = rows.find((r) => r.athleteId === athleteId && r.key === key);
          const currentEntry = currentRow?.entry;
          const currentName = currentRow?.athleteName || currentEntry?.athleteName || "";
          const sessionN = Number(currentEntry?.sessionN || 0);

          if (act === "approve") {
            await writeLaneHistory({
              athleteId,
              athleteName: currentName,
              key,
              entry: {
                ...currentEntry,
                coachNote,
              },
              coachNote,
            });

            await patchSession({
              athleteId,
              key,
              patch: {
                status: "closed",
                coachNote,
                closedAt: serverTimestamp(),
              },
            });

            if (msgEl) msgEl.textContent = "Approved and archived.";
          }

          if (act === "revision") {
            await patchSession({
              athleteId,
              key,
              patch: {
                status: "needs_revision",
                coachNote,
              },
            });

            if (msgEl) msgEl.textContent = "Marked revision.";
          }

          if (act === "xp5") {
            const amt = 5;

            await awardXp({
              athleteId,
              amount: amt,
              note: coachNote || "Conditioning (+5)",
              meta: {
                lane: "conditioning",
                track: currentEntry?.track || "",
                segmentId: currentEntry?.segmentId || "segment1",
                sessionN,
                key,
              },
            });

            await writeLaneHistory({
              athleteId,
              athleteName: currentName,
              key,
              entry: {
                ...currentEntry,
                coachNote,
                awardedXp: amt,
              },
              coachNote,
            });

            await patchSession({
              athleteId,
              key,
              patch: {
                status: "closed",
                coachNote,
                awardedXp: amt,
                closedAt: serverTimestamp(),
              },
            });

            if (msgEl) msgEl.textContent = "Awarded +5 and closed.";
          }

          await loadSubmissions();
        } catch (err) {
          console.error("Conditioning coach action error:", err);
          if (msgEl) {
            msgEl.textContent = `Error: ${err?.message || "see console"}`;
          }
          setCardBusy(safeId, false, "");
        }
      });
    });
  } catch (err) {
    console.error("Conditioning review error:", err);
    container.innerHTML = `<div class="empty">Error loading Conditioning submissions.</div>`;
  }
}

loadRequests();
loadSubmissions();