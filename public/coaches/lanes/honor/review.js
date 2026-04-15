// /public/coaches/lanes/honor/review.js
// Coach Review: Honor submissions (V1.2)
//
// - Reads: laneSubmissions/*
// - Targets: honor_segment1_session{N}
// - Actions: Approve / Revision / Award +5 / Award +10
// - XP award uses XP_URL
// - Approval writes permanent record into laneHistory
//
// Honor rules:
// - F4 Honor: +5 or +10
// - F8 Honor: +5 only (UI clamps; engine should clamp too)
//
// Notes:
// - Uses updateDoc + dot-path patching so submission body is never wiped.
// - Uses real coach UID for reviewedBy.
// - Disables all action buttons on a card while processing.
// - CLOSED items are hidden from this queue but remain in Firestore.
// - Closed items are copied into laneHistory for athlete-facing record.

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

function isFoundry8Id(id = "") {
  return /^F8[_-]/i.test(String(id || ""));
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

function defaultCoachNote(existing = "") {
  if (String(existing || "").trim()) return existing;

  return [
    "What stood out:",
    "",
    "What needs work:",
    "",
    "Next step:"
  ].join("\n");
}

/* -----------------------------
   XP award
------------------------------ */
async function awardXp({ athleteId, amount, note = "", meta = {} }) {
  const payload = {
    uid: athleteId,
    kind: "HONOR",
    amount: Number(amount) || 0,
    lane: "honor",
    meta: {
      lane: "honor",
      source: "honor_lane_review",
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

/* -----------------------------
   Firestore patch
------------------------------ */
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

/* -----------------------------
   Write athlete-facing history
------------------------------ */
async function writeLaneHistory({ athleteId, athleteName, key, entry, coachNote = "" }) {
  const historyId = `${athleteId}__${key}`;
  const historyRef = doc(db, "laneHistory", historyId);

  const sessionN =
    Number(entry?.sessionN) ||
    Number(String(key).match(/session(\d+)/i)?.[1] || 0) ||
    0;

  const awardedXp = Number(entry?.awardedXp || 0);

  await setDoc(historyRef, {
    athleteId,
    athleteName: athleteName || "",
    lane: "honor",
    segmentId: "segment1",
    segment: 1,
    sessionN,
    session: sessionN,

    status: "closed",

    body: entry?.body || "",
    notes: entry?.body || "",
    submissionText: entry?.body || "",

    coachNote: coachNote || entry?.coachNote || "",

    awardedXp,
    xpAwarded: awardedXp,
    progressPercent: awardedXp,

    submittedAt: entry?.submittedAt || null,
    reviewedAt: entry?.reviewedAt || null,
    closedAt: serverTimestamp(),

    sourceCollection: "laneSubmissions",
    sourceAthleteId: athleteId,
    sourceKey: key,
    historyType: "submission"
  }, { merge: true });
}

/* -----------------------------
   Render
------------------------------ */
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
    Number(String(key).match(/session(\d+)/i)?.[1] || 0) ||
    0;

  const isF8 = isFoundry8Id(athleteId);

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
          ${isF8 ? `<span style="opacity:.75;font-size:.85rem;">F8 → +5 only</span>` : ""}
        </div>
        <div style="opacity:.7;font-size:.9rem;">Submitted: ${esc(submittedAt)}</div>
      </div>

      <div style="margin-top:10px;display:grid;grid-template-columns:1fr;gap:10px;">
        <div style="padding:10px;border:1px solid #1f2937;border-radius:12px;background:#0b1017;">
          <div style="font-weight:900;margin-bottom:6px;">Honor • Segment 1 • Session ${esc(String(sessionN || "?"))}</div>
          <div style="opacity:.72;font-size:.85rem;margin-bottom:8px;">Athlete submission</div>
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
          >${esc(defaultCoachNote(coachNote))}</textarea>
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
            ${(awardLocked || isF8) ? "disabled data-award-locked" : ""}
            style="${btnStyle("brand")}opacity:${(awardLocked || isF8) ? ".4" : "1"};"
          >Award +10</button>
        </div>

        <div id="msg_${safeId}" style="opacity:.75;font-size:.9rem;"></div>
      </div>
    </div>
  `;
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
        if (String(entry.lane || "").toLowerCase() !== "honor") return;
        if (String(entry.segmentId || "").toLowerCase() !== "segment1") return;
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
      : `<div class="empty">No Honor submissions in active review.</div>`;

    container.querySelectorAll("button[data-act][data-id][data-key]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const act = btn.getAttribute("data-act");
        const athleteId = btn.getAttribute("data-id");
        const key = btn.getAttribute("data-key");
        const isF8 = isFoundry8Id(athleteId);

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
            Number(String(key).match(/session(\d+)/i)?.[1] || 0) || null;

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

          if (act === "xp5" || act === "xp10") {
            let amt = act === "xp10" ? 10 : 5;
            if (isF8) amt = 5;

            await awardXp({
              athleteId,
              amount: amt,
              note: coachNote || `Honor submission (+${amt})`,
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
                closedAt: serverTimestamp(),
                coachNote,
                awardedXp: amt,
              },
            });

            if (msgEl) msgEl.textContent = `Awarded +${amt} and closed.`;
          }

          await loadSubmissions();
        } catch (err) {
          console.error("Honor coach action error:", err);
          if (msgEl) {
            msgEl.textContent = `Error: ${err?.message || "see console"}`;
          }
          setCardBusy(safeId, false, "");
        }
      });
    });
  } catch (err) {
    console.error("Honor review error:", err);
    container.innerHTML = `<div class="empty">Error loading Honor submissions.</div>`;
  }
}

loadSubmissions();