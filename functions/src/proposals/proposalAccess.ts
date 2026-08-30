import {
  HttpsError,
} from "firebase-functions/v2/https";

import {
  getFirestore,
} from "firebase-admin/firestore";

export type ProposalStaffAccess = {
  uid: string;
  role: string;
  status: string;
  fullName: string | null;
  teamId: string | null;
  teamName: string | null;
  locationIds: string[];
};

function cleanString(
  value: unknown
): string {
  return String(
    value ?? ""
  ).trim();
}

function normalizeRole(
  value: unknown
): string {
  return cleanString(value)
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
}

function normalizeLocationIds(
  staff: Record<string, unknown>
): string[] {
  const values = new Set<string>();

  const rawLocationIds =
    staff.locationIds;

  if (Array.isArray(rawLocationIds)) {
    for (const value of rawLocationIds) {
      const cleaned = cleanString(value);
      if (cleaned) values.add(cleaned);
    }
  } else {
    const cleaned =
      cleanString(rawLocationIds);

    if (cleaned) values.add(cleaned);
  }

  // Legacy single-location staff records remain supported.
  const legacyLocationId =
    cleanString(staff.locationId);

  if (legacyLocationId) {
    values.add(legacyLocationId);
  }

  return [...values];
}

const ALLOWED_PROPOSAL_ROLES =
  new Set([
    "admin",
    "system_admin",
    "management",
    "manager",
    "location_manager",
  ]);

export async function requireProposalStaffAccess(
  uid: string
): Promise<ProposalStaffAccess> {
  const cleanUid =
    cleanString(uid);

  if (!cleanUid) {
    throw new HttpsError(
      "unauthenticated",
      "A signed-in staff account is required."
    );
  }

  const db =
    getFirestore();

  const staffSnap =
    await db
      .collection("staff")
      .doc(cleanUid)
      .get();

  if (!staffSnap.exists) {
    throw new HttpsError(
      "permission-denied",
      "An active Sandman staff record is required."
    );
  }

  const staff =
    staffSnap.data() || {};

  const status =
    cleanString(
      staff.status
    ).toLowerCase();

  const role =
    normalizeRole(
      staff.role
    );

  if (status !== "active") {
    throw new HttpsError(
      "permission-denied",
      "This staff account is not active."
    );
  }

  if (
    !ALLOWED_PROPOSAL_ROLES.has(
      role
    )
  ) {
    throw new HttpsError(
      "permission-denied",
      "This staff role does not have proposal access."
    );
  }

  return {
    uid:
      cleanUid,

    role,

    status,

    fullName:
      cleanString(
        staff.fullName
      ) || null,

    teamId:
      cleanString(
        staff.teamId
      ) || null,

    teamName:
      cleanString(
        staff.teamName
      ) || null,

    locationIds:
      normalizeLocationIds(staff),
  };
}

export function requireProposalLocationAccess(
  staffAccess: ProposalStaffAccess,
  locationIdValue: unknown
): void {
  const locationId =
    cleanString(locationIdValue);

  if (!locationId) {
    throw new HttpsError(
      "failed-precondition",
      "This proposal does not have a valid location."
    );
  }

  // Admin roles retain system-wide proposal oversight.
  if (
    staffAccess.role === "admin" ||
    staffAccess.role === "system_admin"
  ) {
    return;
  }

  if (
    !staffAccess.locationIds.includes(
      locationId
    )
  ) {
    throw new HttpsError(
      "permission-denied",
      "This proposal is outside your assigned location."
    );
  }
}
