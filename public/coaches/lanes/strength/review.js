// /public/coaches/lanes/strength/review.js

import {
  db,
  ensureSignedIn,
  collection,
  getDocs,
  doc,
  updateDoc,
  setDoc,
  serverTimestamp,
} from "/assets/js/firebase-init.js";

import { XP_URL } from "/assets/js/coach-endpoints.js";

await ensureSignedIn();

const container = document.getElementById("submissions-container");
const requestContainer = document.getElementById("remote-requests-container");

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

  return `<span style="${base}background:rgba(245,158,11,.12);border-color:rgba(245,158,11,.35);color:#fdba74;">PENDING</span>`;
}

function btnStyle(kind = "brand") {
  const base =
    "padding:.45rem .7rem;border-radius:10px;border:1px solid #27304a;background:#0b1017;color:#e8eef7;cursor:pointer;font-weight:900;";

  if (kind === "brand") {
    return base + "background:#ffdd48;color:#000;border-color:#ffdd48;";
  }

  if (kind === "danger") {
    return base + "border-color:rgba(239,68,68,.6);";
  }

  if (kind === "ok") {
    return base + "border-color:rgba(34,197,94,.6);";
  }

  if (kind === "muted") {
    return base + "border-color:rgba(148,163,184,.45);color:#cbd5e1;";
  }

  return base;
}

function parseFunctionJson(raw) {
  return raw?.result ?? raw?.data ?? raw;
}

function coachUid() {
  return window.COACH_UID || localStorage.getItem("coachUid") || "DEV_COACH";
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
    lane: "strength",
    meta: {
      lane: "strength",
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
  const sessionN =
    Number(entry?.sessionN) ||
    Number(String(key).match(/(\d+)$/)?.[1] || 0) ||
    0;

  const historyId = `${athleteId}__${key}__${Date.now()}`;
  const historyRef = doc(db, "laneHistory", historyId);

  await setDoc(historyRef, {
    athleteId,
    athleteName: athleteName || "",
    lane: "strength",
    segmentId: "segment1",
    segment: 1,
    sessionN,
    session: sessionN,

    status: "closed",

    body: entry?.body || "",
    notes: entry?.body || "",
    submissionText: entry?.body || "",

    coachNote: coachNote || entry?.coachNote || "",
    awardedXp: Number(entry?.awardedXp || 0),

    submittedAt: entry?.submittedAt || null,
    reviewedAt: entry?.reviewedAt || null,
    closedAt: serverTimestamp(),

    sourceCollection: "laneSubmissions",
    sourceAthleteId: athleteId,
    sourceKey: key,
    historyType: "submission"
  });
}

async function resetRemoteAssignment(athleteId) {
  const ref = doc(db, "athletes", athleteId);

  await updateDoc(ref, {
    "assignments.strength.remoteHIIT.enabled": false,
    "assignments.strength.remoteHIIT.requested": false,
    "assignments.strength.remoteHIIT.assignedWorkout": "",
  });
}

function renderCard({ athleteId, athleteName, key, entry }) {
  const status = entry?.status || "pending";
  const submittedAt = safeWhen(entry?.submittedAt);
  const body = entry?.body || "";
  const coachNote = entry?.coachNote || "";
  const awardedXp = entry?.awardedXp;

  const awardLocked = typeof awardedXp === "number" && awardedXp > 0;
  const safeId = keySafe(`${athleteId}__${key}`);

  const sessionN =
    Number(entry?.sessionN) ||
    Number(String(key).match(/(\d+)$/)?.[1] || 0) ||
    0;

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
          <span style="opacity:.75;font-size:.85rem;">S1 · Session ${esc(String(sessionN || "?"))}</span>
          ${awardLocked ? `<span style="opacity:.75;font-size:.85rem;">XP: +${awardedXp}</span>` : ""}
        </div>
        <div style="opacity:.7;font-size:.9rem;">Submitted: ${esc(submittedAt)}</div>
      </div>

      <div style="margin-top:10px;padding:10px;border:1px solid #1f2937;border-radius:12px;background:#0b1017;">
        <div style="font-weight:900;margin-bottom:6px;">Strength • Segment 1 • Session ${esc(String(sessionN || "?"))}</div>
        <div style="white-space:pre-wrap;line-height:1.45;">${esc(body)}</div>
      </div>

      <div style="margin-top:10px;display:grid;gap:8px;">
        <label style="display:grid;gap:4px;">
          <span style="opacity:.75;font-size:.9rem;">Coach note (optional)</span>
          <input
            id="note_${safeId}"
            value="${esc(coachNote)}"
            placeholder="Short note back to athlete…"
            style="padding:.55rem;border-radius:10px;border:1px solid #27304a;background:#0b1017;color:#e8eef7;"
          />
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

          <button
            data-act="xp10"
            data-id="${esc(athleteId)}"
            data-key="${esc(key)}"
            ${awardLocked ? "disabled data-award-locked" : ""}
            style="${btnStyle("brand")}opacity:${awardLocked ? ".4" : "1"};"
          >Award +10</button>
        </div>

        <div id="msg_${safeId}" style="opacity:.75;font-size:.9rem;"></div>
      </div>
    </div>
  `;
}

function renderRemoteRequestCard({ athleteId, athleteName, remoteHIIT }) {
  const safeId = keySafe(`remote_req__${athleteId}`);
  const assignedWorkout = String(remoteHIIT?.assignedWorkout || "A").trim() || "A";
  const requestedAt = safeWhen(remoteHIIT?.requestedAt);

  return `
    <div
      data-remote-card="${safeId}"
      style="padding:12px;border:1px solid #27304a;border-radius:14px;background:#111c35;margin-bottom:12px;"
    >
      <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;">
        <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
          <div style="font-weight:900;font-size:1.05rem;">${esc(athleteName || athleteId)}</div>
          <div style="opacity:.6;font-size:.8rem;">${esc(athleteName ? athleteId : "")}</div>
          <span style="display:inline-flex;align-items:center;gap:6px;padding:.18rem .55rem;border-radius:999px;font-weight:900;font-size:.78rem;border:1px solid rgba(245,158,11,.35);background:rgba(245,158,11,.12);color:#fdba74;">REQUESTED</span>
        </div>
        <div style="opacity:.7;font-size:.9rem;">Requested: ${esc(requestedAt)}</div>
      </div>

      <div style="margin-top:10px;display:grid;gap:8px;">
        <label style="display:grid;gap:4px;max-width:240px;">
          <span style="opacity:.75;font-size:.9rem;">Assign workout</span>
          <select
            id="remote_assign_${safeId}"
            class="remote-select"
            data-athlete="${esc(athleteId)}"
            style="padding:.55rem;border-radius:10px;border:1px solid #27304a;background:#0b1017;color:#e8eef7;"
          >
            <option value="A" ${assignedWorkout === "A" ? "selected" : ""}>A</option>
            <option value="B" ${assignedWorkout === "B" ? "selected" : ""}>B</option>
            <option value="C" ${assignedWorkout === "C" ? "selected" : ""}>C</option>
          </select>
        </label>

        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          <button
            data-remote-act="open"
            data-id="${esc(athleteId)}"
            data-safe="${esc(safeId)}"
            style="${btnStyle("ok")}"
          >Open Remote Work</button>

          <button
            data-remote-act="deny"
            data-id="${esc(athleteId)}"
            data-safe="${esc(safeId)}"
            style="${btnStyle("danger")}"
          >Deny</button>
        </div>

        <div id="remote_msg_${safeId}" style="opacity:.75;font-size:.9rem;"></div>
      </div>
    </div>
  `;
}

function attachRemoteHandlers() {
  if (!requestContainer) return;

  requestContainer.querySelectorAll("button[data-remote-act][data-id][data-safe]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const act = btn.getAttribute("data-remote-act");
      const athleteId = btn.getAttribute("data-id");
      const safeId = btn.getAttribute("data-safe");
      const msgEl = document.getElementById(`remote_msg_${safeId}`);
      const selectEl = document.getElementById(`remote_assign_${safeId}`);
      const assignedWorkout = String(selectEl?.value || "A").trim();

      btn.disabled = true;
      if (msgEl) msgEl.textContent = "Working…";

      try {
        if (act === "open") {
          await updateDoc(doc(db, "athletes", athleteId), {
            "assignments.strength.remoteHIIT.enabled": true,
            "assignments.strength.remoteHIIT.requested": false,
            "assignments.strength.remoteHIIT.assignedWorkout": assignedWorkout,
            "assignments.strength.remoteHIIT.openedAt": serverTimestamp(),
            "assignments.strength.remoteHIIT.openedBy": String(coachUid()).trim(),
          });

          if (msgEl) msgEl.textContent = `Opened remote work (${assignedWorkout}).`;
        }

        if (act === "deny") {
          await updateDoc(doc(db, "athletes", athleteId), {
            "assignments.strength.remoteHIIT.enabled": false,
            "assignments.strength.remoteHIIT.requested": false,
            "assignments.strength.remoteHIIT.assignedWorkout": "",
            "assignments.strength.remoteHIIT.deniedAt": serverTimestamp(),
            "assignments.strength.remoteHIIT.deniedBy": String(coachUid()).trim(),
          });

          if (msgEl) msgEl.textContent = "Request denied.";
        }

        await loadRemoteRequests();
      } catch (err) {
        console.error("Remote request action error:", err);
        if (msgEl) msgEl.textContent = `Error: ${err?.message || "see console"}`;
        btn.disabled = false;
      }
    });
  });
}

async function loadRemoteRequests() {
  if (!requestContainer) return;

  try {
    const snap = await getDocs(collection(db, "athletes"));
    const rows = [];

    snap.forEach((docSnap) => {
      const athleteId = docSnap.id;
      const athlete = docSnap.data() || {};
      const remoteHIIT = athlete?.assignments?.strength?.remoteHIIT || {};

      if (!remoteHIIT?.requested) return;

      rows.push({
        athleteId,
        athleteName: athlete?.fullName || "",
        remoteHIIT,
      });
    });

    rows.sort((a, b) => {
      const ta = a.remoteHIIT?.requestedAt?.toMillis?.() || 0;
      const tb = b.remoteHIIT?.requestedAt?.toMillis?.() || 0;
      return tb - ta;
    });

    requestContainer.innerHTML = rows.length
      ? rows.map((r) => renderRemoteRequestCard(r)).join("")
      : `<div class="empty">No remote work requests.</div>`;

    attachRemoteHandlers();
  } catch (err) {
    console.error("Remote requests load error:", err);
    requestContainer.innerHTML = `<div class="empty">Error loading remote requests.</div>`;
  }
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
        if (entry.lane !== "strength") return;
        if (entry.segmentId !== "segment1") return;
        if (!(entry?.body || "").trim()) return;
        if (entry.status === "closed") return;

        rows.push({
          athleteId,
          athleteName: entry?.athleteName || "",
          key: k,
          entry,
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
      : `<div class="empty">No Strength submissions in active review.</div>`;

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

          const sessionN =
            Number(currentEntry?.sessionN) ||
            Number(String(key).match(/(\d+)$/)?.[1] || 0) ||
            null;

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

            if (currentEntry?.kind === "remote_hiit") {
              await resetRemoteAssignment(athleteId);
            }

            if (msgEl) msgEl.textContent = "Approved and closed.";
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

          if (act === "xp5" || act === "xp10") {
            const amt = act === "xp10" ? 10 : 5;

            await awardXp({
              athleteId,
              amount: amt,
              note: coachNote || `Strength submission (+${amt})`,
              meta: {
                segmentId: "segment1",
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

            if (currentEntry?.kind === "remote_hiit") {
              await resetRemoteAssignment(athleteId);
            }

            if (msgEl) msgEl.textContent = `Awarded +${amt} and closed.`;
          }

          await loadRemoteRequests();
          await loadSubmissions();
        } catch (err) {
          console.error("Strength coach action error:", err);
          if (msgEl) {
            msgEl.textContent = `Error: ${err?.message || "see console"}`;
          }
          setCardBusy(safeId, false, "");
        }
      });
    });
  } catch (err) {
    console.error("Strength review error:", err);
    container.innerHTML = `<div class="empty">Error loading Strength submissions.</div>`;
  }
}

await loadRemoteRequests();
await loadSubmissions();