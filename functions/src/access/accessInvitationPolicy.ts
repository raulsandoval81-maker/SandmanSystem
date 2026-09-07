export const ACCESS_INVITATION_TTL_MS = 48 * 60 * 60 * 1000;

export type AccessInvitationRole = "parent" | "athlete" | "coach" | "management";
export const ATHLETE_ACCESS_MODES = Object.freeze([
  "parent_managed", "hybrid", "self_managed",
] as const);
export type AthleteAccessMode = typeof ATHLETE_ACCESS_MODES[number];
export const DIRECT_ATHLETE_ACCESS_MODES = Object.freeze([
  "hybrid", "self_managed",
] as const);

export function normalizeAccessEmail(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

export function assertParentInvitationContext(input: {
  role: unknown;
  email: unknown;
  athleteUid: unknown;
  relationshipId: unknown;
}) {
  if (String(input.role || "") !== "parent") throw new Error("WRONG_ROLE");
  const email = normalizeAccessEmail(input.email);
  const athleteUid = String(input.athleteUid || "").trim().toUpperCase();
  const relationshipId = String(input.relationshipId || "").trim();
  if (!email || !email.includes("@")) throw new Error("INVALID_EMAIL");
  if (!athleteUid) throw new Error("MISSING_ATHLETE");
  if (!relationshipId) throw new Error("MISSING_RELATIONSHIP");
  return { role: "parent" as const, email, athleteUid, relationshipId };
}

export function assertAthleteInvitationContext(input: {
  role: unknown;
  email: unknown;
  athleteUid: unknown;
  accessMode: unknown;
  parentApproved: unknown;
}) {
  if (String(input.role || "") !== "athlete") throw new Error("WRONG_ROLE");
  const email = normalizeAccessEmail(input.email);
  const athleteUid = String(input.athleteUid || "").trim().toUpperCase();
  const accessMode = String(input.accessMode || "").trim().toLowerCase() as AthleteAccessMode;
  if (!email || !email.includes("@")) throw new Error("INVALID_EMAIL");
  if (!athleteUid) throw new Error("MISSING_ATHLETE");
  if (!DIRECT_ATHLETE_ACCESS_MODES.includes(accessMode as "hybrid" | "self_managed")) {
    throw new Error("DIRECT_ACCESS_NOT_ALLOWED");
  }
  if (accessMode === "hybrid" && input.parentApproved !== true) {
    throw new Error("PARENT_APPROVAL_REQUIRED");
  }
  return {
    role: "athlete" as const,
    email,
    athleteUid,
    accessMode,
    parentApproved: accessMode === "hybrid" ? true : input.parentApproved === true,
  };
}

export function assertConsumableAthleteInvitation(input: {
  exists: boolean;
  role: unknown;
  used: boolean;
  exp: number;
  now: number;
  invitationEmail: unknown;
  authEmail: unknown;
  invitationAthleteUid: unknown;
  actualAthleteUid: unknown;
  accessMode: unknown;
  parentApproved: unknown;
  existingAthleteAuthUid: unknown;
  callerUid: unknown;
  callerAthleteIds: unknown[];
}) {
  if (!input.exists) throw new Error("INVITATION_NOT_FOUND");
  if (String(input.role || "") !== "athlete") throw new Error("WRONG_ROLE");
  if (input.used) throw new Error("INVITATION_USED");
  if (!input.exp || input.now > input.exp) throw new Error("INVITATION_EXPIRED");

  const email = normalizeAccessEmail(input.invitationEmail);
  if (!email || email !== normalizeAccessEmail(input.authEmail)) throw new Error("EMAIL_MISMATCH");
  const athleteUid = String(input.invitationAthleteUid || "").trim().toUpperCase();
  if (!athleteUid || athleteUid !== String(input.actualAthleteUid || "").trim().toUpperCase()) {
    throw new Error("ATHLETE_MISMATCH");
  }
  const accessMode = String(input.accessMode || "").trim().toLowerCase() as AthleteAccessMode;
  if (!DIRECT_ATHLETE_ACCESS_MODES.includes(accessMode as "hybrid" | "self_managed")) {
    throw new Error("DIRECT_ACCESS_NOT_ALLOWED");
  }
  if (accessMode === "hybrid" && input.parentApproved !== true) {
    throw new Error("PARENT_APPROVAL_REQUIRED");
  }

  const callerUid = String(input.callerUid || "").trim();
  const existingAuthUid = String(input.existingAthleteAuthUid || "").trim();
  if (existingAuthUid && existingAuthUid !== callerUid) throw new Error("DIFFERENT_ATHLETE_UID");
  const conflictingAthlete = input.callerAthleteIds
    .map((value) => String(value || "").trim().toUpperCase())
    .find((value) => value && value !== athleteUid);
  if (conflictingAthlete) throw new Error("CALLER_ALREADY_BOUND");

  return { email, athleteUid, callerUid, accessMode, parentApproved: input.parentApproved === true };
}

export function assertAthleteAccessTransition(input: {
  currentMode: unknown;
  targetMode: unknown;
  existingAuthUid: unknown;
}) {
  const currentMode = String(input.currentMode || "").trim().toLowerCase();
  const targetMode = String(input.targetMode || "").trim().toLowerCase();
  if (!String(input.existingAuthUid || "").trim()) throw new Error("DIRECT_ACCESS_NOT_ACTIVE");
  if (targetMode !== "self_managed") throw new Error("INVALID_TRANSITION_TARGET");
  if (currentMode === "self_managed") {
    return { currentMode: "self_managed" as const, targetMode: "self_managed" as const, already: true };
  }
  if (currentMode !== "hybrid") throw new Error("INVALID_ACCESS_TRANSITION");
  return { currentMode: "hybrid" as const, targetMode: "self_managed" as const, already: false };
}

export function assertConsumableParentInvitation(input: {
  exists: boolean;
  role: unknown;
  used: boolean;
  exp: number;
  now: number;
  invitationEmail: unknown;
  authEmail: unknown;
  invitationAthleteUid: unknown;
  relationshipAthleteUid: unknown;
  invitationRelationshipId: unknown;
  actualRelationshipId: unknown;
  relationshipEmail: unknown;
  relationshipStatus: unknown;
  existingRelationshipParentUid: unknown;
  existingAthleteParentUid: unknown;
  callerUid: unknown;
}) {
  if (!input.exists) throw new Error("INVITATION_NOT_FOUND");
  if (String(input.role || "") !== "parent") throw new Error("WRONG_ROLE");
  if (input.used) throw new Error("INVITATION_USED");
  if (!input.exp || input.now > input.exp) throw new Error("INVITATION_EXPIRED");

  const email = normalizeAccessEmail(input.invitationEmail);
  if (!email || email !== normalizeAccessEmail(input.authEmail)) throw new Error("EMAIL_MISMATCH");

  const athleteUid = String(input.invitationAthleteUid || "").trim().toUpperCase();
  if (!athleteUid || athleteUid !== String(input.relationshipAthleteUid || "").trim().toUpperCase()) {
    throw new Error("ATHLETE_MISMATCH");
  }
  if (String(input.invitationRelationshipId || "") !== String(input.actualRelationshipId || "")) {
    throw new Error("RELATIONSHIP_MISMATCH");
  }
  if (email !== normalizeAccessEmail(input.relationshipEmail)) throw new Error("RELATIONSHIP_EMAIL_MISMATCH");
  if (!["pending", "active"].includes(String(input.relationshipStatus || "").toLowerCase())) {
    throw new Error("RELATIONSHIP_NOT_APPROVED");
  }

  const callerUid = String(input.callerUid || "").trim();
  for (const existingUid of [input.existingRelationshipParentUid, input.existingAthleteParentUid]) {
    const value = String(existingUid || "").trim();
    if (value && value !== callerUid) throw new Error("DIFFERENT_PARENT_UID");
  }

  return { email, athleteUid, callerUid };
}
