import { functions, httpsCallable } from "/assets/js/firebase-init.js";
import { requireCoach, isCoachAuthenticationError, coachLoginUrl } from "/assets/js/coach-guard.js";
import { requireManagement, managementLoginUrl } from "/management/shared/guards/management-guard.js";

const callList = httpsCallable(functions, "listCompetitionEvents");
const callSave = httpsCallable(functions, "upsertCompetitionEvent");
const callPublication = httpsCallable(functions, "setCompetitionPublication");
const el = (id) => document.getElementById(id);
let records = [];
let listMode = "upcoming";

if (!el("weighInAnchorTime")) {
  const label = document.createElement("label");
  label.innerHTML = 'Weigh-In / Event Anchor Time<input id="weighInAnchorTime" type="time"><small class="muted">Defaults to 6:00 AM for member countdowns.</small>';
  el("startAtField").after(label);
}
if (!el("eventTimeZone")) { const label = document.createElement("label"); label.innerHTML = 'Event timezone<input id="eventTimeZone" value="America/Los_Angeles" required>'; el("weighInAnchorTime").closest("label").after(label); }

function pacificToday(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}
function timestampDate(value) {
  if (!value) return null;
  if (typeof value.toDate === "function") return value.toDate();
  if (Number.isFinite(value.seconds)) return new Date(value.seconds * 1000);
  const parsed = new Date(value); return Number.isNaN(parsed.getTime()) ? null : parsed;
}
function countdown(record) {
  const now = new Date();
  if (record.timePrecision !== "datetime") {
    const days = Math.round((Date.parse(`${record.startDate}T00:00:00Z`) - Date.parse(`${pacificToday(now)}T00:00:00Z`)) / 86400000);
    return days > 0 ? `${days} DAYS` : "TODAY / IN PROGRESS";
  }
  const target = timestampDate(record.startAt);
  if (!target || target <= now) return "TODAY / IN PROGRESS";
  const ms = target - now;
  const days = Math.floor(ms / 86400000), hours = Math.floor(ms % 86400000 / 3600000);
  if (days) return `${days} DAYS · ${hours} HOURS`;
  const minutes = Math.max(1, Math.ceil(ms / 60000));
  return hours ? `${hours} HOURS · ${minutes % 60} MINUTES` : `${minutes} MINUTES`;
}
function staffBucket(record) {
  const today = pacificToday(), finalDate = record.endDate || record.startDate;
  if (record.status === "active" && finalDate >= today) return "upcoming";
  const daysPast = Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${finalDate}T00:00:00Z`)) / 86400000);
  return daysPast <= 90 ? "history" : "hidden";
}
function safe(value) { return String(value ?? "").replace(/[&<>'"]/g, (char) => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", "'":"&#39;", '"':"&quot;" }[char])); }
function safeHttpUrl(value) {
  try {
    const url = new URL(String(value || ""));
    return url.protocol === "http:" || url.protocol === "https:" ? url.href : "";
  } catch {
    return "";
  }
}

function render() {
  const discipline = el("disciplineFilter").value;
  const scheduleRecords = records.filter((record) => record.programScopes?.includes("wrestling") && record.status === "active");
  const published = scheduleRecords.length > 0 && scheduleRecords.every((record) => record.publicationStatus === "published");
  const mixed = scheduleRecords.some((record) => record.publicationStatus === "published") && !published;
  el("schedulePublicationStatus").textContent = published ? "PUBLISHED" : mixed ? "MIXED / DRAFT" : "DRAFT";
  el("schedulePublicationStatus").className = `pill ${published ? "published" : "draft"}`;
  el("schedulePublicationButton").textContent = published ? "Unpublish Schedule" : "Publish Schedule";
  el("schedulePublicationButton").dataset.next = published ? "draft" : "published";
  const shown = records.filter((record) => record.disciplineId === discipline || record.programScopes?.includes(discipline)).filter((record) => staffBucket(record) === listMode);
  el("listTitle").textContent = listMode === "upcoming" ? "Upcoming" : "History";
  el("eventCount").textContent = `${shown.length} event${shown.length === 1 ? "" : "s"}`;
  el("eventList").innerHTML = shown.length ? shown.map((record) => {
    const published = record.publicationStatus === "published";
    const registrationUrl = safeHttpUrl(record.registrationUrl);
    return `<article class="event-card ${record.disciplineId === "strength-honor" ? "strength-honor" : ""}"><div><div class="actions" style="justify-content:flex-start;margin-bottom:8px"><span class="pill ${published ? "published" : "draft"}">${published ? "PUBLISHED" : "DRAFT"}</span><span class="pill">${record.disciplineId === "strength-honor" ? "Strength & Honor" : "Wrestling"}</span>${record.sanctionCard ? `<span class="pill">${safe(record.sanctionCard)}</span>` : ""}</div><h3>${safe(record.name)}</h3><p><span class="countdown">${safe(countdown(record))}</span> · ${safe(record.startDate)}${record.endDate ? `–${safe(record.endDate)}` : ""} · ${safe(record.locationName || "Location pending")}</p>${record.sanctionNote ? `<p>Sanction note: ${safe(record.sanctionNote)}</p>` : ""}${record.registrationDeadline ? `<p>Registration deadline: ${safe(record.registrationDeadline)}</p>` : ""}${registrationUrl ? `<p><a class="button secondary" href="${safe(registrationUrl)}" target="_blank" rel="noopener noreferrer">Registration</a></p>` : ""}</div><div class="actions"><button class="button secondary" data-edit="${safe(record.eventId)}">Edit</button></div></article>`;
  }).join("") : `<p class="empty">No ${listMode} competition events in this program.</p>`;
}
function toggleTime() { const known = el("timePrecision").value === "datetime"; el("startAtField").hidden = !known; el("startAt").required = known; }
function openEditor(record = {}) {
  el("eventEditor").hidden = false; el("editorTitle").textContent = record.eventId ? "Edit Competition" : "New Competition";
  const values = { eventId:"", eventName:"", eventDiscipline:"wrestling", seasonYear:2026, startDate:"", endDate:"", timePrecision:"date", weighInAnchorTime:"", eventTimeZone:"America/Los_Angeles", locationName:"", sanctionCard:"", sanctionNote:"", registrationUrl:"", registrationDeadline:"", coachNotes:"", eventStatus:"active" };
  const supportedSanctions = new Set(["USAW", "SCWAY", "AAU", "RMN", "UNKNOWN"]);
  const sanctionCard = supportedSanctions.has(String(record.sanctionCard || "").toUpperCase()) ? String(record.sanctionCard).toUpperCase() : "";
  const source = { eventId:record.eventId, eventName:record.name, eventDiscipline:record.disciplineId, seasonYear:record.seasonYear, startDate:record.startDate, endDate:record.endDate, timePrecision:record.timePrecision, weighInAnchorTime:record.weighInAnchorTime, eventTimeZone:record.timeZone, locationName:record.locationName, sanctionCard, sanctionNote:record.sanctionNote, registrationUrl:record.registrationUrl, registrationDeadline:record.registrationDeadline, coachNotes:record.coachNotes, eventStatus:record.status };
  Object.entries(values).forEach(([id, fallback]) => { el(id).value = source[id] ?? fallback; }); toggleTime();
}
async function load() { records = (await callList({ disciplineId:"wrestling" })).data?.events || []; render(); }

el("competitionForm").addEventListener("submit", async (event) => {
  event.preventDefault(); const precision = el("timePrecision").value; el("competitionStatus").textContent = "Saving…";
  try { await callSave({ eventId:el("eventId").value || undefined, name:el("eventName").value, disciplineId:el("eventDiscipline").value, programScopes:["wrestling"], seasonYear:Number(el("seasonYear").value), startDate:el("startDate").value, endDate:el("endDate").value || null, startAt:precision === "datetime" ? new Date(el("startAt").value).toISOString() : null, endAt:null, timePrecision:precision, timeZone:el("eventTimeZone").value, weighInAnchorTime:el("weighInAnchorTime").value || null, locationName:el("locationName").value, sanctionCard:el("sanctionCard").value || null, sanctionNote:el("sanctionNote").value || null, registrationUrl:el("registrationUrl").value || null, registrationDeadline:el("registrationDeadline").value || null, status:el("eventStatus").value, coachNotes:el("coachNotes").value }); el("competitionStatus").textContent = "Saved. Publication state was not changed."; el("eventEditor").hidden = true; await load(); }
  catch (error) { el("competitionStatus").textContent = `Save failed: ${error.message}`; el("competitionStatus").classList.add("error"); }
});
el("eventList").addEventListener("click", async (event) => {
  const button = event.target.closest("button"); if (!button) return;
  const id = button.dataset.edit;
  const record = records.find((item) => item.eventId === id); if (!record) return;
  if (button.dataset.edit) openEditor(record);
});
el("schedulePublicationButton").addEventListener("click", async () => { const button = el("schedulePublicationButton"); button.disabled = true; try { const result = await callPublication({ seasonYear:2026, programScope:"wrestling", publicationStatus:button.dataset.next }); el("competitionStatus").textContent = `${result.data?.updatedCount || 0} schedule events ${button.dataset.next === "published" ? "published" : "unpublished"}.`; await load(); } catch (error) { el("competitionStatus").textContent = `Publication failed: ${error.message}`; el("competitionStatus").classList.add("error"); } finally { button.disabled = false; } });
el("newEventButton").addEventListener("click", () => openEditor()); el("cancelEditButton").addEventListener("click", () => { el("eventEditor").hidden = true; }); el("timePrecision").addEventListener("change", toggleTime); el("disciplineFilter").addEventListener("change", render);
el("upcomingFilter").addEventListener("click", () => { listMode="upcoming"; el("upcomingFilter").classList.add("active"); el("historyFilter").classList.remove("active"); render(); });
el("historyFilter").addEventListener("click", () => { listMode="history"; el("historyFilter").classList.add("active"); el("upcomingFilter").classList.remove("active"); render(); });

const managementPortal = document.body.dataset.competitionPortal === "management";

try { await (managementPortal ? requireManagement() : requireCoach()); el("competitionProtected").hidden = false; el("competitionStatus").textContent = managementPortal ? "Management fallback access verified. Coach remains the primary competition owner." : "Coach access verified. Drafts remain staff-only until Publish."; await load(); }
catch (error) { el("competitionStatus").classList.add("error"); const authentication = managementPortal ? "Management access required." : (isCoachAuthenticationError(error) ? "Coach sign-in required." : "Coach authorization required."); el("competitionStatus").innerHTML = `${authentication} <a href="${managementPortal ? managementLoginUrl() : coachLoginUrl()}">Sign in</a>`; }
