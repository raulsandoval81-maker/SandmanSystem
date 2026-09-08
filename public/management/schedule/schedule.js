import { auth, db, doc, getDoc, serverTimestamp, setDoc } from "/assets/js/firebase-init.js";
import { signOut } from "https://www.gstatic.com/firebasejs/10.13.1/firebase-auth.js";
import { managementLoginUrl, requireManagement } from "/management/shared/guards/management-guard.js";
import { LOCATION_NAMES, LOCATION_SCHEDULE_DRAFTS, LOCATION_SCHEDULES, SANTA_YNEZ_VALLEY_SCHEDULE_SEED, normalizeLocationId, normalizeSchedule } from "/assets/js/location-schedule.js";

const managerIdentity = document.getElementById("managerIdentity");
const signOutBtn = document.getElementById("signOutBtn");
const sidebarSignOutBtn = document.getElementById("sidebarSignOutBtn");
const managementSidebar = document.getElementById("managementSidebar");
const menuToggleBtn = document.getElementById("menuToggleBtn");
const sidebarBackdrop = document.getElementById("sidebarBackdrop");
const locationSelect = document.getElementById("scheduleLocation");
const locationName = document.getElementById("scheduleLocationName");
const locationStatus = document.getElementById("scheduleLocationStatus");
const rowsEl = document.getElementById("scheduleRows");
const tableWrap = document.getElementById("scheduleTableWrap");
const emptyState = document.getElementById("scheduleEmptyState");
const message = document.getElementById("scheduleMessage");
const filterButtons = [...document.querySelectorAll(".schedule-filter")];

let context = null;
let activeFilter = "all";
let current = normalizeSchedule({}, "santa-ynez-valley");

const clean = (value) => String(value ?? "").trim();
const esc = (value) => clean(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
const typeLabel = (type) => type === "fitness" ? "Fitness" : "Combat";
const providerLabel = (provider) => provider === "yesc" ? "YESC" : "Sandman";
const clone = (value) => JSON.parse(JSON.stringify(value));

function setSidebarOpen(open) {
  managementSidebar?.classList.toggle("is-open", open);
  menuToggleBtn?.setAttribute("aria-expanded", open ? "true" : "false");
  if (sidebarBackdrop) sidebarBackdrop.hidden = !open;
}
menuToggleBtn?.addEventListener("click", () => setSidebarOpen(!managementSidebar?.classList.contains("is-open")));
sidebarBackdrop?.addEventListener("click", () => setSidebarOpen(false));
async function handleSignOut() { await signOut(auth); window.location.replace("/login/"); }
signOutBtn?.addEventListener("click", handleSignOut);
sidebarSignOutBtn?.addEventListener("click", handleSignOut);

function permittedLocations(access) {
  if (access.isSystemAdmin) return Object.keys(LOCATION_NAMES);
  return (access.scope?.locationIds || []).map(normalizeLocationId).filter(Boolean);
}

function render() {
  locationName.textContent = current.locationName;
  locationStatus.textContent = current.status === "published" ? "Published copy loaded" : current.weekly.length ? "Draft" : "Unpublished";
  const rows = current.weekly.map((row, index) => ({ row, index })).filter(({ row }) => activeFilter === "all" || row.type === activeFilter);
  emptyState.hidden = current.weekly.length > 0;
  tableWrap.hidden = current.weekly.length === 0;
  rowsEl.innerHTML = rows.map(({ row, index }) => `<tr><td>${esc(row.day)}</td><td><span class="schedule-class-name">${esc(row.title || row.name)}</span></td><td><span class="schedule-type schedule-type--${esc(row.type)}">${esc(typeLabel(row.type))}</span></td><td><span class="schedule-provider schedule-provider--${esc(row.provider)}">${esc(providerLabel(row.provider))}</span></td><td>${esc(row.label || row.time)}</td><td>${esc(row.instructor)}</td><td><div class="schedule-actions"><button class="schedule-action-btn" type="button" data-edit="${index}">Edit</button><button class="schedule-action-btn" type="button" data-remove="${index}">Remove</button></div></td></tr>`).join("");
  if (current.weekly.length && !rows.length) rowsEl.innerHTML = `<tr><td colspan="7">No ${esc(typeLabel(activeFilter))} classes in this draft.</td></tr>`;
}

function promptRow(existing = {}) {
  const title = prompt("Class name", existing.title || existing.name || "");
  if (title === null) return null;
  const day = prompt("Day or days", existing.day || "");
  if (day === null) return null;
  const label = prompt("Display time", existing.label || existing.time || "");
  if (label === null) return null;
  const type = clean(prompt("Type: combat or fitness", existing.type || "combat")).toLowerCase();
  if (!["combat", "fitness"].includes(type)) throw new Error("Type must be combat or fitness.");
  return { ...existing, title: clean(title), day: clean(day), label: clean(label), type, provider: clean(prompt("Provider: sandman or yesc", existing.provider || "sandman")).toLowerCase() || "sandman", instructor: clean(prompt("Instructor", existing.instructor || "")), details: clean(prompt("Details", existing.details || "")), audience: existing.audience || "all", discipline: existing.discipline || "" };
}

rowsEl?.addEventListener("click", (event) => {
  const edit = event.target.closest("[data-edit]");
  const remove = event.target.closest("[data-remove]");
  try {
    if (edit) {
      const index = Number(edit.dataset.edit);
      const row = promptRow(current.weekly[index]);
      if (row) current.weekly[index] = row;
    }
    if (remove && confirm("Remove this class from the draft?")) current.weekly.splice(Number(remove.dataset.remove), 1);
    render();
  } catch (error) {
    message.textContent = error.message;
  }
});

async function loadLocation(locationId) {
  const id = normalizeLocationId(locationId);
  message.textContent = "Loading location schedule…";
  const [draftSnap, publishedSnap] = await Promise.all([
    getDoc(doc(db, LOCATION_SCHEDULE_DRAFTS, id)),
    getDoc(doc(db, LOCATION_SCHEDULES, id)),
  ]);
  if (draftSnap.exists()) current = { ...normalizeSchedule(draftSnap.data(), id), status: "draft" };
  else if (publishedSnap.exists()) current = { ...normalizeSchedule(publishedSnap.data(), id), status: "draft" };
  else if (id === "santa-ynez-valley") current = clone(SANTA_YNEZ_VALLEY_SCHEDULE_SEED);
  else current = { ...normalizeSchedule({}, id), status: "draft" };
  current.locationId = id;
  current.locationName = LOCATION_NAMES[id];
  activeFilter = "all";
  filterButtons.forEach((button) => button.classList.toggle("is-active", button.dataset.filter === "all"));
  message.textContent = current.weekly.length ? "Review this draft, then save or publish explicitly." : "This location has no draft or published schedule.";
  render();
}

async function saveDraft() {
  const id = current.locationId;
  await setDoc(doc(db, LOCATION_SCHEDULE_DRAFTS, id), { ...current, status: "draft", updatedAt: serverTimestamp(), updatedBy: context.user.uid }, { merge: false });
  message.textContent = "Draft saved. Published audiences are unchanged.";
  locationStatus.textContent = "Draft saved";
}

async function publish() {
  if (!confirm(`Publish the current ${current.locationName} schedule to Parent, Athlete, Coach, and public views?`)) return;

  const id = current.locationId;

  const publishedPayload = {
    locationId: id,
    locationName: LOCATION_NAMES[id],
    timezone: current.timezone || "America/Los_Angeles",
    status: "published",
    weekly: current.weekly,
    events: current.events,
    banner: current.banner,
    publishedAt: serverTimestamp()
  };

  await setDoc(
    doc(db, LOCATION_SCHEDULES, id),
    publishedPayload,
    { merge: false }
  );

  await setDoc(
    doc(db, LOCATION_SCHEDULE_DRAFTS, id),
    {
      ...current,
      locationId: id,
      locationName: LOCATION_NAMES[id],
      status: "draft",
      updatedAt: serverTimestamp(),
      updatedBy: context.user.uid
    },
    { merge: false }
  );

  message.textContent = "Published successfully. All schedule audiences now read this version.";
  locationStatus.textContent = "Published";
}

locationSelect?.addEventListener("change", () => loadLocation(locationSelect.value).catch((error) => { message.textContent = error.message; }));
filterButtons.forEach((button) => button.addEventListener("click", () => { activeFilter = button.dataset.filter || "all"; filterButtons.forEach((item) => item.classList.toggle("is-active", item === button)); render(); }));
document.getElementById("addClassBtn")?.addEventListener("click", () => { try { const row = promptRow(); if (row) current.weekly.push(row); render(); } catch (error) { message.textContent = error.message; } });
document.getElementById("saveDraftBtn")?.addEventListener("click", () => saveDraft().catch((error) => { message.textContent = error.message; }));
document.getElementById("publishScheduleBtn")?.addEventListener("click", () => publish().catch((error) => { message.textContent = error.message; }));
document.getElementById("previewScheduleBtn")?.addEventListener("click", () => window.open(`/locations/${current.locationId}/schedule.html`, "_blank", "noopener"));

async function start() {
  context = await requireManagement();
  managerIdentity.textContent = `${clean(context.staff?.fullName || context.staff?.displayName || context.user.email || "Approved Management Account")} — ${context.user.email || "Authenticated"}`;
  const allowed = permittedLocations(context);
  [...locationSelect.options].forEach((option) => { option.hidden = !allowed.includes(option.value); option.disabled = !allowed.includes(option.value); });
  if (!allowed.length) throw new Error("No authorized schedule location is assigned.");
  locationSelect.value = allowed.includes(locationSelect.value) ? locationSelect.value : allowed[0];
  await loadLocation(locationSelect.value);
}

start().catch((error) => {
  console.error("[management-schedule] startup failed", error);

  const errorMessage =
    error?.message ||
    "Management Schedule could not load.";

  managerIdentity.textContent = errorMessage;
  message.textContent = errorMessage;

  const requiresAuthentication =
    !auth.currentUser ||
    auth.currentUser.isAnonymous ||
    /authentication required/i.test(errorMessage);

  if (requiresAuthentication) {
    setTimeout(
      () => window.location.replace(managementLoginUrl()),
      1200
    );
  }
});
