import { db, collection, getDocs } from "/assets/js/firebase-init.js";
import { requireCoach } from "/assets/js/coach-guard.js";

const ENDPOINT = "https://us-central1-sandmandashboard.cloudfunctions.net/testRecognitionQueue";
const $ = (id) => document.getElementById(id);
const clean = (v) => String(v ?? "").trim();

function esc(v="") {
  return String(v)
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;");
}

function nameOf(a, uid) {
  return clean(a?.publicName || a?.fullName || a?.name) || uid;
}

function panelUrl(uid) {
  return "/coaches/testing/coach-athlete-panel.html?id=" + encodeURIComponent(uid);
}

function render(el, rows, emptyText) {
  el.innerHTML = rows.length ? rows.join("") : `<div class="testing-ops-empty">${esc(emptyText)}</div>`;
}

async function init() {
  const status = $("testingStatus");
  const readinessEl = $("readinessQueue");
  const scheduledEl = $("scheduledQueue");
  const activeEl = $("activeQueue");

  try {
    const coach = await requireCoach();
    const token = await coach.user.getIdToken();
    const [queueResponse, athleteSnap] = await Promise.all([
      fetch(ENDPOINT, { headers: { Authorization: `Bearer ${token}` } }),
      getDocs(collection(db, "athletes"))
    ]);
    if (!queueResponse.ok) throw new Error("Testing queue unavailable.");
    const queueData = await queueResponse.json();
    const athletes = new Map(athleteSnap.docs.map((d) => [d.id, d.data() || {}]));

    const readiness = [];
    const scheduled = [];
    const active = [];

    const testingItems = Array.isArray(queueData?.queue?.testing) ? queueData.queue.testing : [];
    testingItems.forEach((item) => {
      const stage = clean(item?.stage).toUpperCase();
      if (!["TEMPLE","TEST_ELIGIBLE"].includes(stage)) return;
      const uid = clean(item?.athleteUid);
      const a = athletes.get(uid) || {};
      const label = stage === "TEMPLE" ? "Temple · Readiness Building" : "Ready for Test";
      readiness.push(`<article class="testing-ops-card"><div><span class="testing-ops-stage">${esc(label)}</span><h3>${esc(nameOf(a, uid))}</h3><p>${esc(uid)} · ${esc(a?.rankName || a?.tier || "—")} · ${Number(a?.xp || 0)} XP</p></div><div class="testing-ops-actions"><a href="${panelUrl(uid)}">Review Readiness</a></div></article>`);
    });

    athletes.forEach((a, uid) => {
      const state = clean(a?.testing?.state).toUpperCase();
      const params = new URLSearchParams({uid, athleteName:nameOf(a,uid), tier:clean(a?.tier||"T0"), track:uid.startsWith("F8_")?"foundry8-combat":"foundry4-combat"});
      const setup = "/coaches/testing/testing-command-center.html?" + params.toString();
      const sheet = "/coaches/testing/coach-sheet.html?" + params.toString();

      if (state === "READY") {
        scheduled.push(`<article class="testing-ops-card"><div><span class="testing-ops-stage">Test Scheduled</span><h3>${esc(nameOf(a,uid))}</h3><p>${esc(uid)} · ${esc(a?.testing?.scheduledDate || "Date not set")}</p></div><div class="testing-ops-actions"><a href="${panelUrl(uid)}">Athlete Review</a><a href="${setup}">Prepare Test</a><a href="${sheet}">Coach Sheet</a></div></article>`);
      }

      if (state === "TESTING") {
        active.push(`<article class="testing-ops-card"><div><span class="testing-ops-stage">Testing In Progress</span><h3>${esc(nameOf(a,uid))}</h3><p>${esc(uid)} · ${esc(a?.tier || "—")}</p></div><div class="testing-ops-actions"><a href="${panelUrl(uid)}">Athlete Test</a><a href="${setup}">Test Session</a><a href="${sheet}">Coach Sheet</a></div></article>`);
      }
    });

    render(readinessEl, readiness, "No athletes are currently in Temple or waiting for a testing decision.");
    render(scheduledEl, scheduled, "No tests are currently scheduled.");
    render(activeEl, active, "No active tests are currently in progress.");

    const total = readiness.length + scheduled.length + active.length;
    status.textContent = total ? `${total} athlete${total===1?"":"s"} currently need testing attention.` : "Testing pipeline is clear.";
  } catch (error) {
    console.error("[testing-operations]", error);
    status.textContent = error?.message || "Testing pipeline unavailable.";
  }
}

void init();
