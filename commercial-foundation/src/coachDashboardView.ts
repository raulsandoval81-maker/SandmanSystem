import {CoachDashboard} from "./coachDashboard";

export const escapeHtml = (value: string) => value.replace(/[&<>"']/g, character =>
  ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"}[character]!));

const list = (items: string[], empty: string) => items.length ?
  `<ul>${items.map(item => `<li>${item}</li>`).join("")}</ul>` : `<p class="muted">${empty}</p>`;
const section = (id: string, title: string, body: string) =>
  `<section class="card" id="${id}"><h2>${title}</h2>${body}</section>`;
const options = (items: {id: string; name: string}[]) => items.map(item =>
  `<option value="${escapeHtml(item.id)}">${escapeHtml(item.name)}</option>`).join("");
const select = (label: string, name: string, choices: string) =>
  `<label>${label}<select required name="${name}">${choices}</select></label>`;
const input = (label: string, name: string, value = "", type = "text") =>
  `<label>${label}<input required name="${name}" value="${escapeHtml(value)}" type="${type}"></label>`;

export function renderCoachDashboard(view: ReturnType<CoachDashboard["snapshot"]>, csrf: string, athleteId: string | null) {
  const form = (action: string, label: string, body: string) => `<form class="stack" action="/coach" method="post">
    <input type="hidden" name="csrf" value="${escapeHtml(csrf)}">
    <input type="hidden" name="action" value="${action}">${body}<button>${label}</button></form>`;
  const time = (value: string) => escapeHtml(new Date(value).toISOString().replace("T", " ").slice(0, 16) + " UTC");
  const {organization, programs, athletes, sessions, attendance, notes, events, activity} = view;
  const programName = (id: string) => escapeHtml(programs.find(program => program.id === id)?.name ?? id);

  if (athleteId !== null) {
    const athlete = athletes.find(record => record.id === athleteId);
    if (!athlete) throw new Error("ATHLETE_NOT_FOUND");
    return `<p><a href="/coach#roster">Back to roster</a></p>` +
      section("profile", escapeHtml(athlete.displayName), `<p>${programName(athlete.programId)} · ${escapeHtml(athlete.participationState ?? "active")}</p>
        <h3>Attendance</h3>${list(attendance.filter(record => record.athleteId === athlete.id).map(record =>
          `${time(record.recordedAt)} · ${escapeHtml(record.state)}`), "No attendance recorded.")}`);
  }

  const groupChoices = options(programs);
  const locationChoices = options(view.locations);
  const groupAndLocation = select("Group", "group", groupChoices) + select("Location", "location", locationChoices);
  const sessionCards = sessions.map(session => {
    const available = athletes.filter(athlete => athlete.programId === session.programId &&
      (!athlete.locationId || athlete.locationId === session.locationId));
    const sessionField = `<input type="hidden" name="session" value="${escapeHtml(session.id)}">`;
    return `<article><h3>${programName(session.programId)} · ${time(session.startsAt)}</h3>
      <p>Ends ${time(session.endsAt)} · ${escapeHtml(session.state)}</p>
      ${list(attendance.filter(record => record.sessionId === session.id).map(record =>
        `${escapeHtml(athletes.find(athlete => athlete.id === record.athleteId)!.displayName)} · ${escapeHtml(record.state)}`), "No attendance recorded.")}
      ${view.canRecordAttendance && available.length ? form("attendance", "Save attendance", sessionField +
        select("Athlete", "athlete", options(available.map(athlete => ({id: athlete.id, name: athlete.displayName})))) +
        select("Attendance", "state", "<option>present</option><option>absent</option><option>excused</option>")) : ""}
      <h4>Coach notes</h4>${list(notes.filter(note => note.sessionId === session.id).map(note =>
        `${time(note.createdAt)} · ${escapeHtml(note.body)}`), "No notes yet.")}
      ${view.canWriteNotes ? form("note", "Add note", sessionField + '<label>Note<textarea required maxlength="2000" name="body"></textarea></label>') : ""}
    </article>`;
  });

  const tabs = [["roster", "Roster"], ["groups", "Teams & groups"], ["sessions", "Sessions"], ["events", "Events"], ["activity", "Activity"], ["settings", "Settings"]];
  return `<p><a href="/dashboard">Account &amp; sign-out</a></p><h2>${escapeHtml(organization.displayName)}</h2>
    <p>${athletes.length} athletes · ${programs.length} groups · ${sessions.length} sessions</p>
    <nav aria-label="Dashboard sections">${tabs.map(([id, label]) => `<a href="#${id}">${label}</a>`).join(" ")}</nav>` +
    section("roster", "Athlete roster", list(athletes.map(athlete =>
      `<a href="/coach?athlete=${encodeURIComponent(athlete.id)}">${escapeHtml(athlete.displayName)}</a> · ${programName(athlete.programId)}`),
      "No athletes in your scope.") + (view.canManageOrganization && groupChoices && locationChoices ?
      form("athlete", "Add synthetic athlete", input("Display name", "name") + groupAndLocation) : "")) +
    section("groups", "Teams and training groups", list(programs.map(program =>
      `${escapeHtml(program.name)} · ${program.disciplines.map(escapeHtml).join(", ")} · ${escapeHtml(program.state)}`),
      "No training groups in your scope.") + (view.canManageOrganization && locationChoices ?
      form("group", "Add training group", input("Group name", "name") + input("Discipline", "discipline") +
        select("Location", "location", locationChoices)) : "")) +
    section("sessions", "Training sessions and attendance", sessionCards.join("") +
      (sessions.length ? "" : '<p class="muted">No training sessions in your scope.</p>') +
      (view.canManageOrganization && view.canSchedule && groupChoices && locationChoices && view.coaches.length ?
        form("schedule", "Schedule session", groupAndLocation + select("Coach", "coach", options(view.coaches.map(id => ({id, name: id})))) +
          input("Starts (ISO 8601 with time zone)", "startsAt") + input("Ends (ISO 8601 with time zone)", "endsAt")) : "")) +
    section("events", "Events and competitions", list(events.map(event =>
      `${escapeHtml(event.title)} · ${escapeHtml(event.type)} · ${time(event.startsAt)}`), "No events scheduled.") +
      (view.canManageOrganization ? form("event", "Add event", input("Title", "title") +
        select("Type", "type", "<option>event</option><option>competition</option>") +
        input("Starts (ISO 8601 with time zone)", "startsAt")) : "")) +
    section("activity", "Activity history", list(activity.map(event =>
      `${time(event.at)} · ${escapeHtml(event.action)} · ${escapeHtml(event.resourceType)}`), "No activity to show.")) +
    section("settings", "Organization settings", view.canManageOrganization ?
      form("settings", "Save settings", input("Organization name", "name", organization.displayName)) :
      `<p>${escapeHtml(organization.displayName)}</p>`);
}
