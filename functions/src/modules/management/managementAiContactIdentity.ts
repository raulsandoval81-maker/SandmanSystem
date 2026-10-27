/**
 * Management AI foundation: conservative contact linking.
 *
 * Pure functions only. No Firestore writes, no outbound messaging, no AI calls.
 * Never merge families solely on matching names, and never use athlete identity
 * to infer a parent/guardian's permission to communicate.
 */
export type ContactIdentity = Readonly<{
  email: string | null;
  phone: string | null;
  identifiers: readonly string[];
}>;

export function normalizeContactEmail(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const value = raw.trim().toLowerCase();
  if (!value || value.length > 254 || /\s/.test(value)) return null;
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value)) return null;
  return value;
}

/** Only US numbers are normalized for now; ambiguity means no match. */
export function normalizeContactPhone(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const value = raw.trim();
  if (!value || /[a-z]/i.test(value)) return null;
  const digits = value.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return null;
}

/** Deterministic lookup hints; NOT permission to auto-merge case records. */
export function contactIdentity(record: Record<string, unknown>): ContactIdentity {
  const email = normalizeContactEmail(record.email ?? record.parentEmail ?? record.contactEmail);
  const phone = normalizeContactPhone(record.phone ?? record.parentPhone ?? record.contactPhone);
  const identifiers = [
    ...(email ? [`email:${email}`] : []),
    ...(phone ? [`phone:${phone}`] : []),
  ];
  return { email, phone, identifiers };
}

export type LinkAssessment =
  | Readonly<{ status: "no-match"; reasons: readonly string[] }>
  | Readonly<{ status: "review"; reasons: readonly string[] }>;

/**
 * An overlap is a potential match for Management review, never an automatic merge.
 * Shared family email addresses and recycled numbers make auto-merging unsafe.
 */
export function assessContactLink(
  first: Record<string, unknown>,
  second: Record<string, unknown>,
): LinkAssessment {
  const a = contactIdentity(first);
  const b = contactIdentity(second);
  const common = a.identifiers.filter((value) => b.identifiers.includes(value));
  return common.length
    ? { status: "review", reasons: common }
    : { status: "no-match", reasons: [] };
}
