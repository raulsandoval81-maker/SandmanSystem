import {
  db,
  collection,
  query,
  where,
  orderBy,
  onSnapshot
} from "/assets/js/firebase-init-para.js";

const params = new URLSearchParams(window.location.search);
const athleteId = params.get("id");

const athleteNameEl = document.getElementById("athlete-name");
const athleteSubEl = document.getElementById("athlete-sub");
const laneFilterEl = document.getElementById("lane-filter");
const statusFilterEl = document.getElementById("status-filter");
const historyListEl = document.getElementById("history-list");

const statTotalEl = document.getElementById("stat-total");
const statApprovedEl = document.getElementById("stat-approved");
const statRevisionEl = document.getElementById("stat-revision");
const statProgressEl = document.getElementById("stat-progress");

let allRows = [];

function esc(s = "") {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function safeDate(ts) {
  try {
    return ts?.toDate?.().toLocaleString() || "";
  } catch {
    return "";
  }
}

function n(v) {
  const num = Number(v);
  return Number.isFinite(num) ? num : 0;
}

function round2(v) {
  return Math.round(n(v) * 100) / 100;
}

function normalizeLane(d) {
  const raw = String(d.lane || "").toLowerCase().trim();

  if (raw.includes("strength")) return "strength";
  if (raw.includes("honor")) return "honor";

  return null;
}

function normalizeStatus(d) {
  const raw = String(d.status || "pending").toLowerCase().trim();

  if (raw === "needs_revision") return "revision";
  return raw;
}

function laneLabel(lane) {
  if (lane === "strength") return "Strength";
  if (lane === "honor") return "Honor";
  return "Lane";
}

function getSegment(d) {
  return d.segment ?? d.segmentN ?? 1;
}

function getSession(d) {
  return d.session ?? d.sessionN ?? 1;
}

function getSubmittedAt(d) {
  return d.submittedAt || d.createdAt || null;
}

function getReviewedAt(d) {
  return d.reviewedAt || null;
}

function getClosedAt(d) {
  return d.closedAt || null;
}

function getSubmissionText(d) {
  return d.submissionText || d.notes || d.body || "";
}

function getCoachNote(d) {
  return d.coachNote || "";
}

function getProgressPercent(d) {
  const explicit = d.progressPercent ?? d.percentAwarded;
  if (explicit !== undefined && explicit !== null && explicit !== "") {
    return round2(explicit);
  }

  const xp = n(d.xpAwarded ?? d.awardedXp);
  if (!xp) return 0;

  // Strength/Honor history speaks in %
  return round2(xp);
}

function matchesFilters(d) {
  const laneFilter = laneFilterEl?.value || "all";
  const statusFilter = statusFilterEl?.value || "all";

  const lane = normalizeLane(d);
  const status = normalizeStatus(d);

  if (!lane) return false;

  const lanePass = laneFilter === "all" || lane === laneFilter;
  const statusPass = statusFilter === "all" || status === statusFilter;

  return lanePass && statusPass;
}

function renderStats(rows) {
  const approved = rows.filter((r) => {
    const s = normalizeStatus(r);
    return s === "approved" || s === "closed";
  }).length;

  const revisions = rows.filter((r) => normalizeStatus(r) === "revision").length;

  const progress = round2(
    rows.reduce((sum, r) => sum + getProgressPercent(r), 0)
  );

  statTotalEl.textContent = String(rows.length);
  statApprovedEl.textContent = String(approved);
  statRevisionEl.textContent = String(revisions);
  statProgressEl.textContent = `${progress}%`;
}

function buildEntry(d) {
  const lane = normalizeLane(d);
  const laneText = laneLabel(lane);
  const status = normalizeStatus(d);
  const pct = getProgressPercent(d);

  const submittedAt = safeDate(getSubmittedAt(d));
  const reviewedAt = safeDate(getReviewedAt(d));
  const closedAt = safeDate(getClosedAt(d));

  const segment = getSegment(d);
  const session = getSession(d);

  return `
    <div class="entry">
      <div class="entry-top">
        <div class="lane">${esc(laneText)}</div>
        <span class="pill">${esc(status.toUpperCase())}</span>
        ${pct ? `<span class="pill reward-progress">+${pct}%</span>` : ""}
      </div>

      <div class="entry-meta">
        <span>Segment ${esc(String(segment))}</span>
        <span>Session ${esc(String(session))}</span>
        ${submittedAt ? `<span>Submitted: ${esc(submittedAt)}</span>` : ""}
        ${reviewedAt ? `<span>Reviewed: ${esc(reviewedAt)}</span>` : ""}
        ${closedAt ? `<span>Closed: ${esc(closedAt)}</span>` : ""}
      </div>

      <div class="submission-box">
        <div class="box-label">Athlete Submission</div>
        <div class="box-text">${esc(getSubmissionText(d) || "No submission text.")}</div>
      </div>

      ${getCoachNote(d) ? `
        <div class="coach-note-box">
          <div class="box-label">Coach Note</div>
          <div class="box-text">${esc(getCoachNote(d))}</div>
        </div>
      ` : ""}
    </div>
  `;
}

function renderRows() {
  const rows = allRows.filter(matchesFilters);

  renderStats(rows);

  if (!rows.length) {
    historyListEl.innerHTML = `<div class="empty">No history found.</div>`;
    return;
  }

  historyListEl.innerHTML = rows.map(buildEntry).join("");
}

if (!athleteId) {
  athleteNameEl.textContent = "Missing athlete ID";
  if (athleteSubEl) athleteSubEl.textContent = "Use ?id=F4_0001";
  historyListEl.innerHTML = `<div class="empty">No athlete selected.</div>`;
} else {
  athleteNameEl.textContent = athleteId;
  if (athleteSubEl) athleteSubEl.textContent = `${athleteId} • Strength / Honor history`;

  // Use closedAt because that is what gets written when items are moved here
  const q = query(
    collection(db, "laneHistory"),
    where("athleteId", "==", athleteId),
    orderBy("closedAt", "desc")
  );

  onSnapshot(
    q,
    (snap) => {
      const rows = [];
      snap.forEach((docSnap) => {
        rows.push({
          _id: docSnap.id,
          ...docSnap.data()
        });
      });

      allRows = rows;
      renderRows();
    },
    (err) => {
      console.error("History load failed:", err);
      historyListEl.innerHTML = `<div class="empty">History failed to load.</div>`;
    }
  );
}

laneFilterEl?.addEventListener("change", renderRows);
statusFilterEl?.addEventListener("change", renderRows);