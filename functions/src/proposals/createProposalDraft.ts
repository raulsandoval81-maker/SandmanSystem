import { createHash } from "node:crypto";
import {
  HttpsError,
  onCall,
} from "firebase-functions/v2/https";

import {
  FieldValue,
  getFirestore,
} from "firebase-admin/firestore";

import {
  ProposalDraft,
} from "./proposalTypes";

import {
  requireProposalStaffAccess,
  requireProposalLocationAccess,
} from "./proposalAccess";
import { CANONICAL_LOCATION_IDS } from "../admin/staffGovernancePolicy";
import { verifyPrepaidConversionSource } from "../billing/prepaidConversionPolicy";
import { canonicalizeProposalPricing } from "./seasonalProposal";

function cleanString(value: unknown): string {
  return String(value ?? "").trim();
}

function cleanEmail(value: unknown): string {
  return cleanString(value).toLowerCase();
}

function nullableString(
  value: unknown
): string | null {
  const cleaned = cleanString(value);
  return cleaned || null;
}

function pad6(value: number): string {
  return String(value).padStart(6, "0");
}

export const createProposalDraft =
  onCall(async (req) => {
    if (!req.auth) {
      throw new HttpsError(
        "unauthenticated",
        "You must be signed in to create a proposal."
      );
    }

    const staffAccess =
      await requireProposalStaffAccess(
        req.auth.uid
      );

    const data = req.data || {};
    const conversionSourceProposalId = cleanString(data.conversionSourceProposalId);
    if (conversionSourceProposalId && !/^P-\d{6}$/.test(conversionSourceProposalId)) {
      throw new HttpsError("invalid-argument", "A valid prior proposal ID is required.");
    }

    const historicalInput = data.managementHistorical &&
      typeof data.managementHistorical === "object" && !Array.isArray(data.managementHistorical)
        ? data.managementHistorical as Record<string, unknown>
        : null;
    const historicalAppointmentId = nullableString(historicalInput?.historicalAppointmentId);
    if (historicalAppointmentId && !/^[A-Za-z0-9_-]{1,128}$/.test(historicalAppointmentId)) {
      throw new HttpsError("invalid-argument", "A valid historical appointment ID is required.");
    }
    const appointmentId = historicalAppointmentId || nullableString(data.appointmentId);

    const admissionsRequestId =
      nullableString(data.admissionsRequestId);

    if (!appointmentId && !admissionsRequestId && !historicalInput) {
      throw new HttpsError("invalid-argument",
        "An Admissions source or documented Management historical case is required.");
    }
    if (historicalInput && (data.appointmentId || admissionsRequestId || conversionSourceProposalId)) {
      throw new HttpsError("invalid-argument",
        "Historical Management entry cannot be mixed with Admissions or conversion routes.");
    }

    const familyName =
      nullableString(
        data.prospect?.familyName ||
        data.familyName
      );

    const primaryContactName =
      nullableString(
        data.prospect?.primaryContactName ||
        data.primaryContactName
      );

    const requestedEmail =
      nullableString(
        cleanEmail(
          data.prospect?.email ||
          data.email
        )
      );

    const phone =
      nullableString(
        data.prospect?.phone ||
        data.phone
      );

    const coachName =
      nullableString(
        data.coach?.name ||
        staffAccess.fullName
      );

    const athletes: unknown[] =
      Array.isArray(data.athletes)
        ? data.athletes
        : [];

    const requestedPricing =
      data.pricing &&
      typeof data.pricing === "object"
        ? data.pricing
        : {};

    const agreement =
      data.agreement &&
      typeof data.agreement === "object"
        ? data.agreement
        : {};

    const internalNotes =
      nullableString(data.internalNotes);

    const callerUid =
      req.auth.uid;

    const db =
      getFirestore();

    // Location ownership and prospect identity/contact are resolved
    // server-side from the authoritative appointment. Do not trust
    // browser-supplied values for enrollment ownership data.
    let locationId: string | null = null;
    const appointmentRef = appointmentId ? db.collection("admissions_appointments").doc(appointmentId) : null;

    let appointmentProspect:
      Record<string, unknown> = {};

    if (appointmentRef) {
      const appointmentSnap = await appointmentRef.get();

      if (!appointmentSnap.exists) {
        throw new HttpsError(
          "not-found",
          "The appointment for this proposal was not found."
        );
      }

      appointmentProspect =
        appointmentSnap.data() || {};

      locationId =
        nullableString(
          appointmentSnap.get("locationId")
        );

      if (!locationId && !historicalAppointmentId) {
        throw new HttpsError(
          "failed-precondition",
          "The appointment does not have a valid location."
        );
      }
    }

    // A historical case is a staff-owned record of an existing paper
    // agreement, not a fabricated Admissions appointment or payment proof.
    const historicalReference = historicalInput
      ? cleanString(historicalInput.sourceReference)
      : "";
    if (historicalInput) {
      const selectedLocation = cleanString(historicalInput.locationId);
      if (!selectedLocation || selectedLocation.length > 128 ||
          historicalReference.length < 8 || historicalReference.length > 200 ||
          historicalInput.confirmExistingAgreement !== true) {
        throw new HttpsError("invalid-argument",
          "Historical entry requires a location, agreement/check reference and staff attestation.");
      }
      locationId = selectedLocation;
      const enteredEmail = cleanEmail(data.prospect?.email || data.email);
      const enteredName = cleanString(data.prospect?.primaryContactName);
      const rawAthlete = athletes[0] && typeof athletes[0] === "object"
        ? athletes[0] as Record<string, unknown> : {};
      const enteredAthlete = cleanString(rawAthlete.name);
      const startDate = cleanString((requestedPricing as Record<string, unknown>).membershipStartDate);
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(enteredEmail) ||
          !enteredName || !enteredAthlete || /^Member \d+$/.test(enteredAthlete) || enteredName.length > 160 ||
          enteredAthlete.length > 160 || athletes.length !== 1 ||
          cleanString(rawAthlete.plan) !== "standard" ||
          cleanString(rawAthlete.billingTerm) !== "annual" ||
          !/^\d{4}-\d{2}-\d{2}$/.test(startDate) ||
          !Number.isFinite(Date.parse(startDate)) ||
          startDate > new Date().toISOString().slice(0, 10)) {
        throw new HttpsError("invalid-argument",
          "Historical case requires one annual Combat athlete, actual start date, and contact identity.");
      }
      if (historicalAppointmentId) {
        const canonicalLocation = cleanString(appointmentProspect.locationId);
        if (!canonicalLocation && !["admin", "system_admin"].includes(staffAccess.role)) {
          throw new HttpsError("permission-denied", "An administrator must verify ownership of an unscoped legacy appointment.");
        }
        if (!CANONICAL_LOCATION_IDS.includes(selectedLocation) ||
            (canonicalLocation && canonicalLocation !== selectedLocation) ||
            cleanEmail(appointmentProspect.email) !== enteredEmail ||
            cleanString(appointmentProspect.athleteName || appointmentProspect.participantName).toLowerCase() !== enteredAthlete.toLowerCase()) {
          throw new HttpsError("failed-precondition", "Historical appointment identity or location requires review.");
        }
      }
      appointmentProspect = {
        ...appointmentProspect,
        registrantRole: cleanString(appointmentProspect.registrantRole) ||
          cleanString(data.prospect?.registrantRole) || "parent-guardian",
        parentName: cleanString(appointmentProspect.parentName) || enteredName,
      };
    }
    if (!locationId) {
      throw new HttpsError("failed-precondition",
        "A proposal requires an authorized enrollment location.");
    }

    requireProposalLocationAccess(
      staffAccess,
      locationId
    );

    const appointmentEmail =
      nullableString(
        cleanEmail(
          appointmentProspect.email
        )
      );

    const proposalEmail =
      appointmentEmail ||
      requestedEmail;

    const proposalEmailSource =
      appointmentEmail
        ? "appointment"
        : requestedEmail
          ? "proposal_input"
          : null;

    // Athlete identity data collected before Admissions should
    // survive into the Proposal. DOB belongs to the athlete,
    // not the prospect/contact record.
    const proposalAthletes =
      athletes.map((athlete, index) => {
        if (
          index !== 0 ||
          !athlete ||
          typeof athlete !== "object" ||
          Array.isArray(athlete)
        ) {
          return athlete;
        }

        const athleteRecord =
          athlete as Record<string, unknown>;

        const appointmentRegistrantRole =
          cleanString(
            appointmentProspect.registrantRole
          ).toLowerCase();

        const authoritativeEnrollmentType =
          appointmentRegistrantRole === "adult-athlete" ||
          appointmentRegistrantRole === "adult_athlete"
            ? "adult"
            : appointmentRegistrantRole === "parent-guardian" ||
              appointmentRegistrantRole === "parent_guardian" ||
              appointmentRegistrantRole === "parent" ||
              appointmentRegistrantRole === "guardian"
                ? "youth"
                : nullableString(
                    athleteRecord.enrollmentType
                  );

        return {
          ...athleteRecord,

          enrollmentType:
            authoritativeEnrollmentType,

          dob:
            nullableString(
              athleteRecord.dob ||
              athleteRecord.dateOfBirth ||
              appointmentProspect.dob ||
              appointmentProspect.dateOfBirth
            ),

          athleteAge:
            nullableString(
              athleteRecord.athleteAge ||
              appointmentProspect.athleteAge
            ),
        };
      });

    const pricing = canonicalizeProposalPricing(
      requestedPricing,
      proposalAthletes,
    );

    // Identity + membership start date own the atomic deduplication key.
    // A different typed reference must never mint a second proposal.
    const historicalCaseId = historicalInput
      ? createHash("sha256").update(JSON.stringify([
          locationId, cleanEmail(data.prospect?.email || data.email),
          cleanString((athletes[0] as Record<string, unknown>).name).toLowerCase(),
          cleanString((requestedPricing as Record<string, unknown>).membershipStartDate),
        ])).digest("hex")
      : null;
    const historicalCaseRef = historicalCaseId
      ? db.collection("historicalProposalCases").doc(historicalCaseId) : null;
    const proposals = db.collection("proposals");
    const historicalEmail = cleanEmail(data.prospect?.email || data.email);
    const historicalAthleteName = cleanString((athletes[0] as Record<string, unknown> | undefined)?.name).toLowerCase();
    const historicalStart = cleanString(requestedPricing.membershipStartDate);
    const counterRef =
      db
        .collection("counters")
        .doc("proposals");

    try {
      const result =
        await db.runTransaction(
          async (tx) => {
            if (historicalAppointmentId && appointmentRef) {
              const legacy = await tx.get(appointmentRef);
              if (!legacy.exists ||
                  nullableString(legacy.get("locationId")) !== nullableString(appointmentProspect.locationId) ||
                  cleanEmail(legacy.get("email")) !== historicalEmail ||
                  cleanString(legacy.get("athleteName") || legacy.get("participantName")).toLowerCase() !== historicalAthleteName) {
                throw new HttpsError("failed-precondition", "Historical appointment changed. Reopen Pricing and verify the current record.");
              }
            }
            if (historicalCaseRef) {
              const existingCase = await tx.get(historicalCaseRef);
              if (existingCase.exists) {
                const existingProposalId = cleanString(existingCase.get("proposalId"));
                if (!/^P-\d{6}$/.test(existingProposalId)) {
                  throw new HttpsError("failed-precondition",
                    "Historical case has inconsistent proposal evidence.");
                }
                const existingProposal = await tx.get(db.collection("proposals").doc(existingProposalId));
                if (!existingProposal.exists || existingProposal.get("locationId") !== locationId ||
                    existingProposal.get("managementHistorical.caseId") !== historicalCaseId ||
                    nullableString(existingProposal.get("prospect.appointmentId")) !== appointmentId) {
                  throw new HttpsError("failed-precondition",
                    "Historical case points to inconsistent proposal; manual review required.");
                }
                return { proposalId: existingProposalId,
                  status: cleanString(existingProposal.get("status")) || "DRAFT",
                  idempotent: true };
              }
            }
            if (historicalCaseRef) {
              // Include legacy and closed records. A candidate with incomplete
              // coverage or conflicting identity requires staff review.
              const prior = await tx.get(proposals.where("prospect.email", "==", historicalEmail));
              const byAppointment = historicalAppointmentId
                ? await tx.get(proposals.where("prospect.appointmentId", "==", historicalAppointmentId))
                : null;
              const candidates = prior.docs.filter(candidate => {
                const existing = candidate.data();
                return Array.isArray(existing.athletes) &&
                  existing.athletes.some((athlete: { name?: unknown } | null) =>
                    cleanString(athlete?.name).toLowerCase() === historicalAthleteName);
              });
              if (byAppointment?.docs.some(candidate => !candidates.some(match => match.id === candidate.id))) {
                throw new HttpsError("failed-precondition", "A linked proposal has conflicting customer identity. Review it before proceeding.");
              }
              if (candidates.length) {
                const [candidate] = candidates;
                const status = cleanString(candidate.get("status")).toUpperCase();
                const coverage = cleanString(candidate.get("lockedSnapshot.pricing.membershipStartDate") ||
                  candidate.get("pricing.membershipStartDate"));
                if (candidates.length !== 1 || !/^P-\d{6}$/.test(candidate.id) ||
                    candidate.get("proposalId") !== candidate.id ||
                    candidate.get("locationId") !== locationId ||
                    candidate.get("athletes").length !== 1 ||
                    !status || ["VOID", "VOIDED", "RETIRED", "CANCELED", "CANCELLED"].includes(status) ||
                    coverage !== historicalStart) {
                  throw new HttpsError("failed-precondition",
                    "Existing historical proposals require identity and coverage review before proceeding.");
                }
                const existingAppointmentId = nullableString(candidate.get("prospect.appointmentId") ||
                  candidate.get("appointmentId"));
                if (appointmentId && existingAppointmentId && existingAppointmentId !== appointmentId) {
                  throw new HttpsError("failed-precondition", "The matching proposal has a different Admissions link. Review the records before proceeding.");
                }
                return { proposalId: candidate.id, status, idempotent: true };
              }
            }
            if (appointmentId && !conversionSourceProposalId) {
              const linked = await tx.get(proposals.where("prospect.appointmentId", "==", appointmentId));
              if (!linked.empty) {
                const [candidate] = linked.docs;
                const status = cleanString(candidate.get("status")).toUpperCase();
                if (linked.size !== 1 || candidate.get("locationId") !== locationId ||
                    !/^P-\d{6}$/.test(candidate.id) || candidate.get("proposalId") !== candidate.id ||
                    !status || ["VOID", "VOIDED", "RETIRED", "CANCELED", "CANCELLED"].includes(status)) {
                  throw new HttpsError("failed-precondition",
                    "Existing appointment proposals require review before proceeding.");
                }
                return { proposalId: candidate.id, status, idempotent: true };
              }
            }
            if (historicalInput && historicalInput.confirmIdentityReview !== true) {
              throw new HttpsError("failed-precondition",
                "Verify the original agreement and search Admissions, Proposals, Billing and Members before issuing a new historical proposal.");
            }
            const counterSnap =
              await tx.get(counterRef);

            const current =
              counterSnap.exists
                ? Number(
                    counterSnap.get("next") ||
                    1
                  )
                : 1;

            if (
              !Number.isInteger(current) ||
              current < 1
            ) {
              throw new HttpsError(
                "failed-precondition",
                "The proposal counter is invalid."
              );
            }

            const proposalId =
              `P-${pad6(current)}`;

            if (conversionSourceProposalId) {
              if (pricing.paymentArrangement !== "prepaid_cash_check") {
                throw new HttpsError("failed-precondition", "A linked conversion requires a Cash/Check Paid-in-Full agreement.");
              }
              const sourceRef = db.collection("proposals").doc(conversionSourceProposalId);
              const source = (await tx.get(sourceRef)).data();
              if (!source || source.locationId !== locationId ||
                  source.prospect?.appointmentId !== appointmentId) {
                throw new HttpsError("failed-precondition", "The prior proposal must belong to this appointment and location.");
              }
              const evidence = await tx.get(sourceRef.collection("manualAdjustments").doc("conversionEvidence"));
              try {
                verifyPrepaidConversionSource({
                  sourceProposalId: conversionSourceProposalId,
                  source,
                  historicalEvidenceFingerprint: evidence.get("fingerprint"),
                  target: {
                    proposalId, locationId, prospect: { email: proposalEmail },
                    athletes: proposalAthletes, pricing, lockedSnapshot: { pricing },
                  },
                  newMembershipStartDate: cleanString(pricing.membershipStartDate),
                });
              } catch (error) {
                throw new HttpsError("failed-precondition", error instanceof Error ? error.message : "Unable to verify the prior agreement.");
              }
              const existing = await tx.get(db.collection("proposals")
                .where("conversionSourceProposalId", "==", conversionSourceProposalId));
              const active = existing.docs.find(doc =>
                doc.get("locationId") === locationId && !["VOID", "RETIRED"].includes(doc.get("status")));
              if (active) return { proposalId: active.id, status: active.get("status"), idempotent: true };
            }

            const proposalRef =
              db
                .collection("proposals")
                .doc(proposalId);

            const historyRef =
              proposalRef
                .collection("history")
                .doc();

            const proposalData:
              ProposalDraft &
              Record<string, unknown> = {
                proposalId,
                status: "DRAFT",
                ...(conversionSourceProposalId ? { conversionSourceProposalId } : {}),
                ...(historicalCaseId ? {
                  managementHistorical: {
                    caseId: historicalCaseId, sourceReference: historicalReference,
                    paymentVerificationAtEntry: "NOT_VERIFIED", recordedBy: callerUid,
                    identityReviewedBy: callerUid,
                    ...(historicalAppointmentId && !appointmentProspect.locationId
                      ? { verifiedLegacyAppointmentLocation: locationId } : {}),
                  },
                } : {}),

                locationId,

                prospect: {
                  appointmentId,
                  admissionsRequestId: historicalAppointmentId
                    ? nullableString(appointmentProspect.admissionsRequestId || appointmentProspect.requestId)
                    : admissionsRequestId,

                  familyName:
                    familyName ||
                    nullableString(
                      appointmentProspect.athleteName ||
                      appointmentProspect.participantName
                    ),

                  primaryContactName:
                    primaryContactName ||
                    nullableString(
                      appointmentProspect.parentName
                    ),

                  registrantRole:
                    nullableString(
                      appointmentProspect.registrantRole
                    ),

                  athleteAge:
                    nullableString(
                      appointmentProspect.athleteAge
                    ),

                  email:
                    proposalEmail,

                  emailSource:
                    proposalEmailSource,

                  phone:
                    phone ||
                    nullableString(
                      appointmentProspect.phone
                    ),

                  city:
                    nullableString(
                      appointmentProspect.city
                    ),

                  state:
                    nullableString(
                      appointmentProspect.state
                    ),
                },

                coach: {
                  uid: callerUid,
                  name: coachName,
                },

                athletes:
                  proposalAthletes,
                pricing,
                agreement,
                internalNotes,

                createdBy:
                  callerUid,

                updatedBy:
                  callerUid,

                createdAt:
                  FieldValue.serverTimestamp(),

                updatedAt:
                  FieldValue.serverTimestamp(),
              };

            tx.set(
              counterRef,
              {
                next:
                  current + 1,

                updatedAt:
                  FieldValue.serverTimestamp(),
              },
              {
                merge: true,
              }
            );

            tx.create(
              proposalRef,
              proposalData
            );
            if (historicalCaseRef) {
              tx.create(historicalCaseRef, {
                proposalId, locationId, sourceReference: historicalReference,
                createdBy: callerUid, createdAt: FieldValue.serverTimestamp(),
              });
            }

            tx.create(
              historyRef,
              {
                proposalId,

                event:
                  historicalCaseId ? "MANAGEMENT_HISTORICAL_DRAFT_CREATED" : "CREATED",
                ...(historicalCaseId ? {
                  historicalCaseId, sourceReference: historicalReference,
                  paymentVerified: false,
                } : {}),
                ...(conversionSourceProposalId ? { conversionSourceProposalId } : {}),

                fromStatus:
                  null,

                toStatus:
                  "DRAFT",

                createdBy:
                  callerUid,

                createdByName:
                  coachName,

                createdAt:
                  FieldValue.serverTimestamp(),
              }
            );

            return {
              proposalId,
              status:
                "DRAFT" as const,
            };
          }
        );

      return {
        ok: true,
        ...result,
      };
    } catch (error) {
      console.error(
        "[createProposalDraft] Failed:",
        error
      );

      if (error instanceof HttpsError) {
        throw error;
      }

      throw new HttpsError(
        "internal",
        "Unable to create the proposal draft."
      );
    }
  });
