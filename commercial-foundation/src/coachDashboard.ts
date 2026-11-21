import {randomUUID} from "node:crypto";
import {
  Academy, Location, AttendanceRecord, AttendanceState, AuthorizationContext, CommercialAthlete, DashboardEvent,
  Membership, PracticeNote, PracticeSession, Program, VerifiedIdentity
} from "./contracts";
import {CommercialFoundation} from "./foundation";
import {FamilyRelationshipService} from "./family";
import {AttendanceService, CoachService, SchedulingService} from "./operations";

export class CoachDashboard {
  readonly organizationId: string;
  private readonly staff: Membership[];
  private readonly scheduling: SchedulingService;

  constructor(private readonly foundation: CommercialFoundation, private readonly context: AuthorizationContext,
              private readonly identity: VerifiedIdentity) {
    this.organizationId = identity.selectedOrganizationId;
    const {store} = foundation;
    const organization = store.getOrganization(this.organizationId);
    if (organization?.state !== "active") throw new Error("ORGANIZATION_INACTIVE");
    this.staff = store.list<Membership>("memberships", this.organizationId).filter(member =>
      member.userId === identity.userId && member.state === "active" &&
      ["organization_admin", "management", "coach"].includes(member.role) &&
      this.validScope(member)
    );
    if (!this.staff.length) throw new Error("STAFF_MEMBERSHIP_REQUIRED");
    this.scheduling = new SchedulingService(foundation);
  }

  private validScope(member: Membership) {
    if (member.scopeType === "organization") return member.scopeId === this.organizationId;
    const kind = member.scopeType === "academy" ? "academies" : "locations";
    return Boolean(this.foundation.store.get(kind, this.organizationId, member.scopeId));
  }

  private covers(member: Membership, academyId?: string, locationId?: string) {
    return member.scopeType === "organization" ||
      (member.scopeType === "academy" && member.scopeId === academyId) ||
      (member.scopeType === "location" && member.scopeId === locationId);
  }

  snapshot() {
    const {store} = this.foundation;
    const org = this.organizationId;
    const sessions = store.list<PracticeSession>("sessions", org).filter(session =>
      this.staff.some(member => this.covers(member, session.academyId, session.locationId) &&
        (member.role !== "coach" || session.coachUserIds.includes(this.identity.userId)))
    );
    const sessionIds = new Set(sessions.map(session => session.id));
    const programs = store.list<Program>("programs", org).filter(program =>
      sessions.some(session => session.programId === program.id) ||
      this.staff.some(member => member.role !== "coach" &&
        (this.covers(member, program.academyId) || program.locationIds.some(id => this.covers(member, program.academyId, id))))
    );
    const athletes = store.list<CommercialAthlete>("athletes", org).filter(athlete => {
      const program = programs.find(group => group.id === athlete.programId);
      const academyId = athlete.academyId ?? program?.academyId;
      return this.staff.some(member => this.covers(member, academyId, athlete.locationId) &&
        (member.role !== "coach" || athlete.assignedCoachUserIds?.includes(this.identity.userId) ||
          sessions.some(session => session.programId === athlete.programId &&
            (athlete.locationId ? session.locationId === athlete.locationId : member.scopeType !== "location"))));
    });
    const athleteIds = new Set(athletes.map(athlete => athlete.id));
    const canManageOrganization = this.staff.some(member =>
      member.scopeType === "organization" && member.role === "organization_admin");
    return {
      organization: store.getOrganization(org)!,
      canManageOrganization,
      canRecordAttendance: this.foundation.hasCapability(this.context, "attendance.manage"),
      canWriteNotes: this.foundation.hasCapability(this.context, "coach.workspace"),
      academies: canManageOrganization ? store.list<Academy>("academies", org) : [],
      locations: canManageOrganization ? store.list<Location>("locations", org) : [],
      coaches: canManageOrganization ? [...new Set(store.list<Membership>("memberships", org)
        .filter(member => member.role === "coach" && member.state === "active").map(member => member.userId))] : [],
      canSchedule: this.foundation.hasCapability(this.context, "schedule.manage"),
      programs,
      athletes,
      sessions: sessions.sort((a, b) => a.startsAt.localeCompare(b.startsAt)),
      attendance: store.list<AttendanceRecord>("attendance", org).filter(record =>
        sessionIds.has(record.sessionId) && athleteIds.has(record.athleteId)),
      notes: store.list<PracticeNote>("practiceNotes", org).filter(note => sessionIds.has(note.sessionId)),
      events: store.list<DashboardEvent>("events", org).sort((a, b) => a.startsAt.localeCompare(b.startsAt)),
      activity: store.listAudits(org).filter(event => event.outcome === "permitted" &&
        (canManageOrganization || event.actorUserId === this.identity.userId))
        .sort((a, b) => b.at.localeCompare(a.at)).slice(0, 30)
    };
  }

  submit(fields: URLSearchParams) {
    const org = this.organizationId;
    const action = fields.get("action");
    const value = (key: string) => fields.get(key)?.trim() ?? "";
    const {store} = this.foundation;
    if (action === "attendance" || action === "note") {
      const view = this.snapshot();
      const session = view.sessions.find(item => item.id === value("session"));
      if (!session) throw new Error("SESSION_NOT_FOUND");
      if (action === "note") {
        new CoachService(this.foundation, this.scheduling).note(this.context, org, session.id, randomUUID(), value("body"));
        return;
      }
      const athlete = view.athletes.find(item => item.id === value("athlete"));
      if (!athlete || athlete.programId !== session.programId ||
          (athlete.locationId && athlete.locationId !== session.locationId)) throw new Error("INVALID_ATTENDANCE_RELATIONSHIP");
      const attendance = new AttendanceService(this.foundation);
      const record = view.attendance.find(item => item.sessionId === session.id && item.athleteId === athlete.id);
      const state = value("state") as AttendanceState;
      if (record) attendance.correct(this.context, org, record.id, state);
      else attendance.record(this.context, org, session.id, athlete.id, state);
      return;
    }

    if (!this.staff.some(member => member.scopeType === "organization" && member.role === "organization_admin")) {
      throw new Error("ROLE_DENIED");
    }
    if (action === "group") {
      const location = store.get<Location>("locations", org, value("location"));
      const name = value("name"), discipline = value("discipline");
      if (!location || !name || name.length > 120 || !discipline || discipline.length > 80) throw new Error("INVALID_GROUP");
      this.foundation.createProgram(this.context, {id: randomUUID(), organizationId: org, academyId: location.academyId,
        name, locationIds: [location.id], disciplines: [discipline], state: "active"});
      return;
    }
    if (action === "athlete" || action === "schedule") {
      const program = store.get<Program>("programs", org, value("group"));
      const locationId = value("location");
      if (!program || !program.locationIds.includes(locationId)) throw new Error("INVALID_GROUP_LOCATION");
      if (action === "athlete") {
        const displayName = value("name");
        if (!displayName || displayName.length > 120) throw new Error("INVALID_ATHLETE_NAME");
        new FamilyRelationshipService(this.foundation).registerAthlete(this.context, {
          id: randomUUID(), organizationId: org, academyId: program.academyId, programId: program.id,
          locationId, displayName, synthetic: true
        });
      } else {
        this.scheduling.create(this.context, {id: randomUUID(), organizationId: org, academyId: program.academyId,
          programId: program.id, locationId, coachUserIds: [value("coach")], startsAt: value("startsAt"),
          endsAt: value("endsAt"), state: "scheduled"});
      }
      return;
    }
    if (action === "settings") {
      const displayName = value("name");
      if (!displayName || displayName.length > 120) throw new Error("INVALID_ORGANIZATION_NAME");
      store.updateOrganization({...store.getOrganization(org)!, displayName});
      this.foundation.auditOperational(this.identity, "organization.settings", "organization", org, "permitted");
      return;
    }
    if (action === "event") {
      const title = value("title"), type = value("type"), startsAt = new Date(value("startsAt"));
      if (!title || title.length > 120 || (type !== "event" && type !== "competition") ||
          !Number.isFinite(startsAt.getTime())) throw new Error("INVALID_EVENT");
      const event: DashboardEvent = {id: randomUUID(), organizationId: org, title, type, startsAt: startsAt.toISOString()};
      store.put("events", event);
      this.foundation.auditOperational(this.identity, "event.create", "event", event.id, "permitted");
      return;
    }
    throw new Error("UNKNOWN_DASHBOARD_ACTION");
  }
}
