import {CoachDashboard} from "./coachDashboard";

export const escapeHtml = (value: string) => value.replace(/[&<>"']/g, character =>
  ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"}[character]!));

const list = (items: string[], empty: string) => items.length ?
  `<ul class="data-list">${items.map(item => `<li>${item}</li>`).join("")}</ul>` : `<div class="empty">${empty}</div>`;
const section = (id: string, title: string, body: string) =>
  `<section class="card" id="${id}" aria-labelledby="${id}-title"><h2 id="${id}-title">${title}</h2>${body}</section>`;
const options = (items: {id: string; name: string}[]) => items.map(item =>
  `<option value="${escapeHtml(item.id)}">${escapeHtml(item.name)}</option>`).join("");
const select = (label: string, name: string, choices: string) =>
  `<label>${label}<select required name="${name}">${choices}</select></label>`;
const input = (label: string, name: string, value = "", type = "text") =>
  `<label>${label}<input required name="${name}" value="${escapeHtml(value)}" type="${type}"></label>`;

export function renderCoachDashboard(view: ReturnType<CoachDashboard["snapshot"]>, csrf: string, athleteId: string | null) {
  const form = (action: string, label: string, body: string) => `<form class="stack form-panel" action="/coach" method="post">
    <input type="hidden" name="csrf" value="${escapeHtml(csrf)}">
    <input type="hidden" name="action" value="${action}">${body}<button>${label}</button></form>`;
  const time = (value: string) => escapeHtml(new Date(value).toISOString().replace("T", " ").slice(0, 16) + " UTC");
  const {organization, programs, athletes, sessions, attendance, notes, events, activity} = view;
  const programName = (id: string) => escapeHtml(programs.find(program => program.id === id)?.name ?? id);
  const upcoming = sessions.filter(session => session.state === "scheduled" && Date.parse(session.startsAt) >= Date.now()).slice(0, 3);
  const markedSessions = new Set(attendance.map(record => record.sessionId));
  const competitions = events.filter(event => event.type === "competition" && Date.parse(event.startsAt) >= Date.now());
  const navItems: [string,string][] = [["overview","Overview"],["roster","Athletes"],["groups","Teams & groups"],["sessions","Practice & attendance"],["events","Competitions"],["activity","Activity"],["settings","Settings"]];
  const menu = `<nav class="sidebar" aria-label="Coach dashboard sections"><div class="sidebar-label">Coach workspace</div>${navItems.map(([id,label])=>`<a href="#${id}">${escapeHtml(label)}</a>`).join("")}<div class="sidebar-foot">Secure, organization-scoped workspace<br>Development pilot</div></nav>`;
  const empty = (heading: string, caption: string) => `<div class="empty"><strong>${escapeHtml(heading)}</strong><div>${escapeHtml(caption)}</div></div>`;

  if (athleteId !== null) {
    const athlete = athletes.find(record => record.id === athleteId);
    if (!athlete) throw new Error("ATHLETE_NOT_FOUND");
    return `<a class="profile-back" href="/coach#roster">← Back to roster</a><div class="profile-head"><div class="avatar" aria-hidden="true">${escapeHtml(athlete.displayName.slice(0, 1).toUpperCase())}</div><div><div class="eyebrow">Athlete profile · Development</div><h1>${escapeHtml(athlete.displayName)}</h1><p class="muted">${programName(athlete.programId)} · ${escapeHtml(athlete.participationState ?? "active")}</p></div></div>` +
      section("profile", "Attendance history", list(attendance.filter(record => record.athleteId === athlete.id).map(record =>
          `<span class="row-main"><strong>${escapeHtml(record.state)}</strong><span class="row-sub">${time(record.recordedAt)}</span></span>`), "No attendance recorded yet."));
  }

  const groupChoices = options(programs);
  const locationChoices = options(view.locations);
  const groupAndLocation = select("Group", "group", groupChoices) + select("Location", "location", locationChoices);
  const sessionCards = sessions.map(session => {
    const available = athletes.filter(athlete => athlete.programId === session.programId &&
      (!athlete.locationId || athlete.locationId === session.locationId));
    const sessionField = `<input type="hidden" name="session" value="${escapeHtml(session.id)}">`;
    return `<article class="session"><div class="session-title"><h3>${programName(session.programId)}</h3><span class="status ${session.state === "scheduled" ? "status--good" : ""}">${escapeHtml(session.state)}</span></div>
      <p class="session-detail">${time(session.startsAt)} – ${time(session.endsAt)}</p>
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

  return `<div class="dashboard-grid">${menu}<div class="content">
    <div class="hero" id="overview"><div class="eyebrow">Sandman Commercial · Coaching command center</div>
      <h1>${escapeHtml(organization.displayName)}</h1><p>Run your program from one secure place. Stay on top of athletes, training sessions, and upcoming events.</p>
      <div class="hero-actions"><a class="button" href="#sessions">Open practice workspace</a><a class="button button-secondary" href="#roster">View athlete roster</a><a class="button button-secondary" href="/dashboard">Account &amp; sign out</a></div></div>
    <div class="stats" aria-label="Program at a glance"><div class="stat"><div class="value">${athletes.length}</div><div class="label">Athletes in scope</div></div>
      <div class="stat"><div class="value">${programs.length}</div><div class="label">Training groups</div></div><div class="stat"><div class="value">${sessions.length}</div><div class="label">Practice sessions</div></div>
      <div class="stat"><div class="value">${competitions.length}</div><div class="label">Upcoming competitions</div></div></div>
    <div class="split"><section class="card" aria-labelledby="upcoming-title"><h2 id="upcoming-title">Up next</h2><p class="section-hint">Your next scheduled practices</p>${list(upcoming.map(session => `<span class="row-main"><strong>${programName(session.programId)}</strong><span class="row-sub">${time(session.startsAt)}</span></span><span class="row-end"><a href="#sessions">Open</a></span>`), "No upcoming practices scheduled.")}</section>
    <section class="card" aria-labelledby="readiness-title"><h2 id="readiness-title">Coach checklist</h2><p class="section-hint">Keep the essentials moving</p>
      <ul class="data-list"><li><span class="row-main"><strong>Attendance records</strong><span class="row-sub">${markedSessions.size} of ${sessions.length} sessions have attendance entries</span></span><a href="#sessions">Review</a></li>
      <li><span class="row-main"><strong>Roster coverage</strong><span class="row-sub">${athletes.length} athletes available to your account</span></span><a href="#roster">Review</a></li>
      <li><span class="row-main"><strong>Events</strong><span class="row-sub">${competitions.length} upcoming competitions</span></span><a href="#events">Review</a></li></ul></section></div>` +
    section("roster", "Athlete roster", `<p class="section-hint">Athletes visible under your coaching permissions.</p>` + list(athletes.map(athlete =>
      `<span class="row-main"><strong><a href="/coach?athlete=${encodeURIComponent(athlete.id)}">${escapeHtml(athlete.displayName)}</a></strong><span class="row-sub">${programName(athlete.programId)}</span></span><span class="row-end"><a href="/coach?athlete=${encodeURIComponent(athlete.id)}">Profile</a></span>`),
      "No athletes in your scope.") + (view.canManageOrganization && groupChoices && locationChoices ?
      form("athlete", "Add synthetic athlete", input("Display name", "name") + groupAndLocation) : "")) +
    section("groups", "Teams and training groups", `<p class="section-hint">Organize athletes by team and discipline.</p>` + list(programs.map(program =>
      `<span class="row-main"><strong>${escapeHtml(program.name)}</strong><span class="row-sub">${program.disciplines.map(escapeHtml).join(", ")}</span></span><span class="tag">${escapeHtml(program.state)}</span>`),
      "No training groups in your scope.") + (view.canManageOrganization && locationChoices ?
      form("group", "Add training group", input("Group name", "name") + input("Discipline", "discipline") +
        select("Location", "location", locationChoices)) : "")) +
    section("sessions", "Training sessions and attendance", `<p class="section-hint">Record participation, share coach notes, and plan practices.</p>` + sessionCards.join("") +
      (sessions.length ? "" : '<p class="muted">No training sessions in your scope.</p>') +
      (view.canManageOrganization && view.canSchedule && groupChoices && locationChoices && view.coaches.length ?
        form("schedule", "Schedule session", groupAndLocation + select("Coach", "coach", options(view.coaches.map(id => ({id, name: id})))) +
          input("Starts (ISO 8601 with time zone)", "startsAt") + input("Ends (ISO 8601 with time zone)", "endsAt")) : "")) +
    section("events", "Events and competitions", `<p class="section-hint">Upcoming competitions and program events.</p>` + list(events.map(event =>
      `<span class="row-main"><strong>${escapeHtml(event.title)}</strong><span class="row-sub">${time(event.startsAt)}</span></span><span class="tag">${escapeHtml(event.type)}</span>`), "No events scheduled.") +
      (view.canManageOrganization ? form("event", "Add event", input("Title", "title") +
        select("Type", "type", "<option>event</option><option>competition</option>") +
        input("Starts (ISO 8601 with time zone)", "startsAt")) : "")) +
    section("activity", "Activity history", `<p class="section-hint">Authorized changes in your workspace.</p>` + list(activity.map(event =>
      `<span class="row-main"><strong>${escapeHtml(event.action)}</strong><span class="row-sub">${time(event.at)} · ${escapeHtml(event.resourceType)}</span></span>`), "No activity to show.")) +
    section("settings", "Organization settings", view.canManageOrganization ?
      form("settings", "Save settings", input("Organization name", "name", organization.displayName)) :
      `<p>${escapeHtml(organization.displayName)}</p>`) + `</div></div>`;
}
