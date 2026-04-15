import {
  db,
  collection,
  query,
  where,
  getDocs,
  doc,
  getDoc,
  updateDoc,
  serverTimestamp
} from "/assets/js/firebase-init.js";

const params = new URLSearchParams(window.location.search);
const athleteId = params.get("uid") || params.get("athleteId");
const decidedBy = params.get("coachId") || "admin";

const wrap = document.getElementById("results");

async function load() {
  if (!athleteId) {
    wrap.innerHTML = "Missing athleteId in URL";
    return;
  }

  const q = query(
    collection(db, "athletes", athleteId, "testingLogs"),
    where("testType", "==", "BASE_CHECK_V1")
  );

  const snap = await getDocs(q);
  const rows = [];

  snap.forEach((docSnap) => {
    rows.push(docSnap.data());
  });

  if (!rows.length) {
    wrap.innerHTML = "No tests found";
    return;
  }

  rows.sort((a, b) => {
    const aTime = a.createdAt?.seconds || 0;
    const bTime = b.createdAt?.seconds || 0;
    return aTime - bTime;
  });

  const totals = [];
  wrap.innerHTML = "";

  rows.forEach((d) => {
    totals.push(Number(d.total || 0));

    const div = document.createElement("div");
    div.style.border = "1px solid #444";
    div.style.padding = "12px";
    div.style.marginBottom = "12px";
    div.style.borderRadius = "10px";

    div.innerHTML = `
      <strong>${d.coachName || d.coachId || "Coach"}</strong><br>
      Score: ${d.total || 0} / 100<br>
      Result: ${d.result || "—"}<br>
      Date: ${d.date || "—"}
    `;

    wrap.appendChild(div);
  });

  const avg = totals.reduce((a, b) => a + b, 0) / totals.length;

  const finalResult =
    avg >= 95 ? "ELITE BASE" :
    avg >= 90 ? "STRONG" :
    avg >= 85 ? "PASS" : "NOT READY";

  const final = document.createElement("div");
  final.style.border = "2px solid #888";
  final.style.padding = "16px";
  final.style.borderRadius = "12px";
  final.style.marginTop = "18px";

  final.innerHTML = `
    <h2 style="margin-top:0;">FINAL</h2>
    <div>Tests counted: ${totals.length}</div>
    <div>Average: ${avg.toFixed(1)} / 100</div>
    <div style="margin-bottom:14px;"><strong>${finalResult}</strong></div>

    <label style="display:block; margin-bottom:8px; font-weight:600;">Decision Note</label>
    <textarea
      id="decisionNote"
      rows="4"
      style="width:100%; box-sizing:border-box; margin-bottom:14px; padding:10px; border-radius:8px;"
      placeholder="Optional note for approve / hold / retest"
    ></textarea>

    <div style="display:flex; gap:10px; flex-wrap:wrap; margin-bottom:14px;">
      <button id="approveBtn" style="padding:10px 14px; border-radius:8px; cursor:pointer;">Approve</button>
      <button id="holdBtn" style="padding:10px 14px; border-radius:8px; cursor:pointer;">Hold</button>
      <button id="retestBtn" style="padding:10px 14px; border-radius:8px; cursor:pointer;">Retest</button>
    </div>

    <div id="decisionStatus" style="font-weight:600;"></div>
  `;

  wrap.appendChild(final);

  const athleteRef = doc(db, "athletes", athleteId);
  const athleteSnap = await getDoc(athleteRef);
  const athleteData = athleteSnap.exists() ? athleteSnap.data() : {};
  const existingDecision = athleteData?.testing?.baseCheckV1?.decision || "";

  if (existingDecision) {
    document.getElementById("decisionStatus").textContent =
      `Decision already saved: ${existingDecision}`;
  }

  async function saveDecision(decision) {
    try {
      const note = document.getElementById("decisionNote").value.trim();

const nextState =
  decision === "APPROVE" ? "COOLDOWN" :
  decision === "HOLD" ? "TEMPLE" :
  decision === "RETEST" ? "ELIGIBLE" :
  "TEMPLE";

      await updateDoc(athleteRef, {
        "testing.baseCheckV1.testType": "BASE_CHECK_V1",
        "testing.baseCheckV1.decision": decision,
        "testing.baseCheckV1.finalResult": finalResult,
        "testing.baseCheckV1.avgScore": Number(avg.toFixed(1)),
        "testing.baseCheckV1.coachCount": totals.length,
        "testing.baseCheckV1.note": note,
        "testing.baseCheckV1.decidedBy": decidedBy,
        "testing.baseCheckV1.decidedAt": serverTimestamp(),
        "testing.baseCheckV1.manualPromotionOnly": true,

        // main athlete testing state
        "testing.state": nextState,
        "testing.lastDecision": decision,
        "testing.lastDecisionAt": serverTimestamp(),

        "updatedAt": serverTimestamp()
      });

      document.getElementById("decisionStatus").textContent =
        `Saved decision: ${decision}`;
      alert(`Decision saved: ${decision}`);
    } catch (err) {
      console.error("decision save failed:", err);
      alert(`Decision save failed: ${err.message || err}`);
    }
  }

  document.getElementById("approveBtn").addEventListener("click", () => {
    saveDecision("APPROVE");
  });

  document.getElementById("holdBtn").addEventListener("click", () => {
    saveDecision("HOLD");
  });

  document.getElementById("retestBtn").addEventListener("click", () => {
    saveDecision("RETEST");
  });
}

load().catch((err) => {
  console.error("results load failed:", err);
  wrap.innerHTML = `Load failed: ${err.message || err}`;
});