import {
  auth,
  db,
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  where,
} from "./firebase-init.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.13.1/firebase-auth.js";
import { loadStrengthPhaseContext } from "./athlete-lane-context.js";
import { combatDashboardModel, dashboardStatusLabel, laneDashboardModel } from "./lane-dashboard-state.js";
import { formatLaneReleaseAt } from "./lane-release-schedule.js";
import { resolveAuthenticatedAthlete } from "./athlete-self-context.js";

const LAST_UID_KEY = "sandman_lastAthleteUid";

function waitForUser() {
  if (auth.currentUser) return Promise.resolve(auth.currentUser);
  return new Promise((resolve) => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      unsubscribe();
      resolve(user || null);
    });
  });
}

async function fetchJson(url) {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error(`Dashboard source unavailable: ${url}`);
  return response.json();
}

export async function resolveSignedInAthlete(requestedId = "") {
  const user = await waitForUser();
  const result = await resolveAuthenticatedAthlete({
    user,
    requestedId,
    rememberedId: localStorage.getItem(LAST_UID_KEY),
    getAthleteById: async (athleteId) => {
      const snapshot = await getDoc(doc(db, "athletes", athleteId));
      return snapshot.exists() ? snapshot.data() || {} : null;
    },
    findAthletesByAuthUid: async (authUid) => {
      const snapshot = await getDocs(query(
        collection(db, "athletes"),
        where("authUid", "==", authUid),
        limit(2)
      ));
      return snapshot.docs.map((item) => ({ athleteId: item.id, athlete: item.data() || {} }));
    },
  });
  if (result.athleteId) localStorage.setItem(LAST_UID_KEY, result.athleteId);
  return result;
}

export async function loadAthleteDashboard({ athleteId, athlete, now = new Date() }) {
  const [submissionSnapshot, systemStatus, operationalPhase] = await Promise.all([
    getDoc(doc(db, "laneSubmissions", athleteId)),
    fetchJson("/vault/system-status.json"),
    getDoc(doc(db, "strengthPhaseSettings", "system")).catch(() => null),
  ]);
  const submissions = submissionSnapshot.exists() ? submissionSnapshot.data() || {} : {};
  const strengthSegment = String(systemStatus?.strength?.activeSegment || "segment1");
  const honorSegment = String(systemStatus?.honor?.activeSegment || "segment1");
  const phaseContext = await loadStrengthPhaseContext({
    operationalPhase: operationalPhase?.exists?.() ? operationalPhase.data()?.activePhase : null,
  });
  const [strengthMeta, strengthData, honorMeta, honorData] = await Promise.all([
    fetchJson(`/vault/strength/${strengthSegment}/${strengthSegment}.meta.json`),
    fetchJson(`/vault/strength/${strengthSegment}/sessions.json`),
    fetchJson(`/vault/honor/${honorSegment}/segment.meta.json`),
    fetchJson(`/vault/honor/${honorSegment}/sessions.json`),
  ]);
  const sessionsOf = (data) => Array.isArray(data) ? data : Array.isArray(data?.sessions) ? data.sessions : [];

  const historySnapshot = await getDocs(query(
    collection(db, "laneHistory"),
    where("athleteId", "==", athleteId)
  ));
  const recentHistory = historySnapshot.docs
    .map((item) => ({ id: item.id, ...item.data() }))
    .sort((a, b) => Number(b.closedAt?.seconds || 0) - Number(a.closedAt?.seconds || 0))
    .slice(0, 5);

  return {
    combat: combatDashboardModel(athlete),
    strength: laneDashboardModel({
      lane: "strength", segmentId: strengthSegment, sessions: sessionsOf(strengthData),
      submissions, athlete, phase: phaseContext.phase, now,
    }),
    honor: laneDashboardModel({
      lane: "honor", segmentId: honorSegment, sessions: sessionsOf(honorData),
      submissions, athlete, category: honorMeta?.category, now,
    }),
    recentHistory,
    sources: { strengthMeta, honorMeta, strengthPhaseSource: phaseContext.source },
  };
}

const labels = {
  preseason: "Preseason", inseason: "In-Season", postseason: "Postseason",
  self: "Self", teammates: "Teammates", team: "Team", competition: "Competition",
  leadership: "Leadership", legacy: "Legacy",
};

function laneCard(lane, model, athleteId) {
  const context = labels[model.phase || model.category] || "Current program";
  const release = model.nextReleaseAt ? `Next release: ${formatLaneReleaseAt(model.nextReleaseAt)}` : dashboardStatusLabel(model.status);
  return `<a class="athlete-status-card athlete-status-card--${lane}" href="/athletes/lanes/${lane}/?id=${encodeURIComponent(athleteId)}">
    <span>${lane}</span><strong>Mission ${model.missionN || "—"} / 40</strong>
    <p>${context}</p><p class="athlete-status-card__state">${release}</p><b>${model.xp.toLocaleString()} XP</b>
  </a>`;
}

export function renderAthleteDashboard(container, dashboard, athleteId) {
  if (!container) return;
  const combat = dashboard.combat;
  container.innerHTML = `<a class="athlete-status-card athlete-status-card--combat" href="/athletes/profile/?id=${encodeURIComponent(athleteId)}">
      <span>Combat</span><strong>${combat.rank}</strong>
      <p>${combat.xp.toLocaleString()}${combat.cap ? ` / ${combat.cap.toLocaleString()}` : ""} XP</p>
      <p class="athlete-status-card__state">Current rank progress</p>
    </a>${laneCard("strength", dashboard.strength, athleteId)}${laneCard("honor", dashboard.honor, athleteId)}`;
  container.hidden = false;
}
