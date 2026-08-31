import {
  db,
  functions,
  httpsCallable,
  collection,
  getDocs,
  doc,
  getDoc
} from "/assets/js/firebase-init.js";

const finalizeTestingSessionCall = httpsCallable(functions, "finalizeTestingSession");

const params = new URLSearchParams(window.location.search);
const athleteId = params.get("uid") || params.get("athleteId") || "";
const decidedBy = params.get("coachId") || "admin";
const sessionId = params.get("sessionId") || "";
const testType = params.get("testType") || "";

const wrap = document.getElementById("results");

function resultFromAvg(avg) {
  if (avg >= 95) return "ELITE BASE";
  if (avg >= 90) return "STRONG";
  if (avg >= 85) return "PASS";
  return "NOT READY";
}

async function load() {
  if (!athleteId) {
    wrap.innerHTML = "Missing athleteId in URL";
    return;
  }

  if (!sessionId) {
    wrap.innerHTML = "Missing sessionId in URL";
    return;
  }

  const logsRef = collection(db, "athletes", athleteId, "testingLogs");
  const snap = await getDocs(logsRef);

  const rows = [];

  snap.forEach((docSnap) => {
    const data = docSnap.data() || {};

    if (data.sessionId !== sessionId) return;
    if (testType && data.testType !== testType) return;

    rows.push(data);
  });

  if (!rows.length) {
    wrap.innerHTML = "No tests found for this session.";
    return;
  }

  rows.sort((a, b) => {
    const aTime = a.createdAt?.seconds || 0;
    const bTime = b.createdAt?.seconds || 0;
    return aTime - bTime;
  });

  const totals = [];
  const REQUIRED_PANEL = 2;
  wrap.innerHTML = "";

  rows.forEach((d) => {
    totals.push(Number(d.total || 0));

    const div = document.createElement("div");
    div.style.border = "1px solid #444";
    div.style.padding = "12px";
    div.style.marginBottom = "12px";
    div.style.borderRadius = "10px";

    div.innerHTML = `
      <strong>${d.coachName || d.coachId || "Coach"}${d.panel ? ` (${d.panel})` : ""}</strong><br>
      Score: ${d.total || 0} / 100<br>
      Result: ${d.result || "—"}<br>
      Date: ${d.date || "—"}
    `;

    wrap.appendChild(div);
  });

  const avg = totals.reduce((a, b) => a + b, 0) / totals.length;
  const finalResult = resultFromAvg(avg);

  const final = document.createElement("div");
  final.style.border = "2px solid #888";
  final.style.padding = "16px";
  final.style.borderRadius = "12px";
  final.style.marginTop = "18px";

  final.innerHTML = `
    <h2 style="margin-top:0;">FINAL</h2>
    <div>Tests counted: ${totals.length}</div>
    <div>Provisional average: ${avg.toFixed(1)} / 100</div>
    <div style="margin-bottom:14px;"><strong>Provisional: ${finalResult}</strong></div>

    <div style="display:flex; gap:10px; flex-wrap:wrap; margin-bottom:14px;">
      <button id="finalizeBtn" style="padding:10px 14px; border-radius:8px; cursor:pointer;">Finalize Result</button>
    </div>

    <div id="decisionStatus" style="font-weight:600;"></div>
  `;

  if (totals.length < REQUIRED_PANEL) {
    final.innerHTML += `
      <div style="color:#ef4444; margin-top:10px; font-weight:700;">
        Waiting for ${REQUIRED_PANEL - totals.length} more coach submission(s)
      </div>
    `;
  }

  wrap.appendChild(final);

  const athleteRef = doc(db, "athletes", athleteId);
  const athleteSnap = await getDoc(athleteRef);
  const athleteData = athleteSnap.exists() ? athleteSnap.data() || {} : {};
  const existingDecision = athleteData?.testing?.baseCheckV1?.decision || "";

  if (existingDecision) {
    document.getElementById("decisionStatus").textContent =
      `Decision already saved: ${existingDecision}`;
  }

  function canDecide() {
    return totals.length >= REQUIRED_PANEL;
  }

  async function finalizeResult() {
    try {
      if (!canDecide()) {
        alert("Panel incomplete. Need at least 2 coach submissions.");
        return;
      }
      const finalized = await finalizeTestingSessionCall({
        uid: athleteId,
        sessionId,
        testType
      });
      const authoritative = finalized.data || {};

      document.getElementById("decisionStatus").textContent =
        `Authoritative ${authoritative.result}: ${authoritative.average} / 100`;
      alert(`Result finalized: ${authoritative.result}`);
    } catch (err) {
      console.error("finalization failed:", err);
      alert(`Finalization failed: ${err.message || err}`);
    }
  }

  document.getElementById("finalizeBtn").addEventListener("click", finalizeResult);
}

load().catch((err) => {
  console.error("results load failed:", err);
  wrap.innerHTML = `Load failed: ${err.message || err}`;
});
