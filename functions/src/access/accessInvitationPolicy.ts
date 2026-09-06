export const ACCESS_INVITATION_TTL_MS = 48 * 60 * 60 * 1000;

export type AccessInvitationRole = "parent" | "athlete" | "coach" | "management";

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
