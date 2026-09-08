import { auth, functions, httpsCallable } from "/assets/js/firebase-init-para.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.13.1/firebase-auth.js";
import {
  formatCombatDisciplineLabel,
  resolveParentAthleteContext
} from "/assets/js/parent-athlete-context.js";

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(window.location.search);
const contextPanel = $("parentSystemContext");
const summary = $("systemContextSummary");
const athleteField = $("systemAthleteField");
const athleteSelect = $("systemAthleteSelect");
const disciplineField = $("systemDisciplineField");
const disciplineSelect = $("systemDisciplineSelect");
const disciplineNotice = $("systemDisciplineNotice");
const getMyAthlete = httpsCallable(functions, "getMyAthlete");
const ACTIVE_PARENT_SYSTEM_DISCIPLINES = Object.freeze(["wrestling", "boxing", "muay-thai"]);

let authorizedAthletes = [];
let selectedAthlete = null;
let selectedContext = null;

function athleteId(athlete = {}) {
  return String(athlete.id || athlete.uid || "").trim().toUpperCase();
}

function athleteName(athlete = {}) {
  return String(athlete.publicName || athlete.fullName || athleteId(athlete) || "Athlete");
}

function requestedAthleteId() {
  return String(params.get("athlete") || params.get("athleteUid") || params.get("uid") || params.get("id") || "")
    .trim().toUpperCase();
}

function setUrlContext(id, discipline) {
  const url = new URL(window.location.href);
  url.searchParams.set("athlete", id);
  for (const alias of ["athleteUid", "uid", "id"]) url.searchParams.delete(alias);
  if (discipline) url.searchParams.set("discipline", discipline);
  else url.searchParams.delete("discipline");
  history.replaceState({}, "", url.pathname + url.search + url.hash);
  params.set("athlete", id);
  if (discipline) params.set("discipline", discipline);
  else params.delete("discipline");
}

function preserveContextOnLinks() {
  document.querySelectorAll('a[href^="/parent/system/"]').forEach((link) => {
    const url = new URL(link.getAttribute("href"), window.location.origin);
    url.searchParams.set("athlete", selectedContext.athleteUid);
    if (selectedContext.activeDiscipline) url.searchParams.set("discipline", selectedContext.activeDiscipline);
    else url.searchParams.delete("discipline");
    link.setAttribute("href", url.pathname + url.search + url.hash);
  });
}

function paintDisciplineVisibility() {
  document.querySelectorAll("[data-parent-discipline]").forEach((item) => {
    item.hidden = item.dataset.parentDiscipline !== selectedContext.activeDiscipline;
  });
  disciplineNotice.hidden = Boolean(selectedContext.activeDiscipline);
}

function resolveSelectedDiscipline(athlete, preferUrl = true) {
  const id = athleteId(athlete);
  const context = resolveParentAthleteContext(athlete, {
    athleteUid: id,
    requestedDiscipline: preferUrl ? params.get("discipline") : "",
    rememberedDiscipline: localStorage.getItem(`parent_active_discipline_${id}`)
  });
  const disciplineIds = context.disciplineIds.filter((discipline) =>
    ACTIVE_PARENT_SYSTEM_DISCIPLINES.includes(discipline)
  );
  const activeDiscipline = disciplineIds.includes(context.activeDiscipline)
    ? context.activeDiscipline
    : (disciplineIds[0] || "");
  return { ...context, disciplineIds, activeDiscipline };
}

function renderDisciplineSelector() {
  disciplineField.hidden = selectedContext.disciplineIds.length <= 1;
  disciplineSelect.replaceChildren();
  selectedContext.disciplineIds.forEach((discipline) => {
    const option = document.createElement("option");
    option.value = discipline;
    option.textContent = formatCombatDisciplineLabel(discipline);
    disciplineSelect.appendChild(option);
  });
  disciplineSelect.value = selectedContext.activeDiscipline;
}

function renderAthleteSelector() {
  athleteField.hidden = authorizedAthletes.length <= 1;
  athleteSelect.replaceChildren();
  authorizedAthletes.forEach((athlete) => {
    const option = document.createElement("option");
    option.value = athleteId(athlete);
    option.textContent = athleteName(athlete);
    athleteSelect.appendChild(option);
  });
  athleteSelect.value = selectedContext.athleteUid;
}

function renderContext() {
  const disciplineLabel = selectedContext.activeDiscipline
    ? formatCombatDisciplineLabel(selectedContext.activeDiscipline)
    : "Discipline guide unavailable";
  summary.textContent = `${athleteName(selectedAthlete)} · ${disciplineLabel}`;
  renderAthleteSelector();
  renderDisciplineSelector();
  paintDisciplineVisibility();
  setUrlContext(selectedContext.athleteUid, selectedContext.activeDiscipline);
  preserveContextOnLinks();
  contextPanel.hidden = false;
}

function selectAthlete(athlete, preferUrl = true) {
  selectedAthlete = athlete;
  selectedContext = resolveSelectedDiscipline(athlete, preferUrl);
  localStorage.setItem("parentSelectedAthleteUid", selectedContext.athleteUid);
  if (selectedContext.activeDiscipline) {
    localStorage.setItem(`parent_active_discipline_${selectedContext.athleteUid}`, selectedContext.activeDiscipline);
  }
  renderContext();
}

athleteSelect.addEventListener("change", () => {
  const athlete = authorizedAthletes.find((entry) => athleteId(entry) === athleteSelect.value);
  if (athlete) selectAthlete(athlete, false);
});

disciplineSelect.addEventListener("change", () => {
  const discipline = disciplineSelect.value;
  if (!selectedContext.disciplineIds.includes(discipline)) return;
  localStorage.setItem(`parent_active_discipline_${selectedContext.athleteUid}`, discipline);
  params.set("discipline", discipline);
  selectedContext = resolveSelectedDiscipline(selectedAthlete, true);
  renderContext();
});

function redirectToParentAuth() {
  const next = encodeURIComponent(window.location.pathname + window.location.search);
  window.location.replace(`/parent/auth.html?next=${next}`);
}

onAuthStateChanged(auth, async (user) => {
  if (!user || user.isAnonymous) return redirectToParentAuth();
  try {
    const response = await getMyAthlete({});
    authorizedAthletes = Array.isArray(response.data?.athletes) ? response.data.athletes : [];
    if (!response.data?.linked || !authorizedAthletes.length) {
      summary.textContent = "No athlete is linked to this Parent account.";
      disciplineNotice.hidden = false;
      document.querySelectorAll("[data-parent-discipline]").forEach((item) => { item.hidden = true; });
      contextPanel.hidden = false;
      return;
    }
    const requested = requestedAthleteId();
    const remembered = String(localStorage.getItem("parentSelectedAthleteUid") || "").toUpperCase();
    selectedAthlete = authorizedAthletes.find((athlete) => athleteId(athlete) === requested)
      || authorizedAthletes.find((athlete) => athleteId(athlete) === remembered)
      || authorizedAthletes[0];
    selectAthlete(selectedAthlete, true);
  } catch (error) {
    console.error("[parent-system] context unavailable", error);
    summary.textContent = "Family context is unavailable right now.";
    disciplineNotice.hidden = false;
    document.querySelectorAll("[data-parent-discipline]").forEach((item) => { item.hidden = true; });
    contextPanel.hidden = false;
  }
});
