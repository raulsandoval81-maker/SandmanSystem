import {
  FieldValue,
  getFirestore,
} from "firebase-admin/firestore";
import {
  HttpsError,
  onCall,
} from "firebase-functions/v2/https";

const db = getFirestore();

function clean(value: unknown): string {
  return String(value ?? "").trim();
}

function firstValue(...values: unknown[]): string | null {
  for (const value of values) {
    const text = clean(value);
    if (text) return text;
  }
  return null;
}

function asRecord(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, any>
    : {};
}

function firstAthlete(value: unknown): Record<string, any> {
  return Array.isArray(value) && value[0] && typeof value[0] === "object"
    ? value[0] as Record<string, any>
    : {};
}

function isOperationalPaidProposal(proposal: Record<string, any>): boolean {
  const status = clean(proposal.status).toUpperCase();
  const paymentStatus = clean(proposal.paymentStatus).toLowerCase();
  const checkoutSessionId = clean(proposal.stripeCheckoutSessionId);
  const isLive =
    proposal.stripeLivemode === true ||
    checkoutSessionId.startsWith("cs_live_");

  return (
    status === "PAID" &&
    paymentStatus === "paid" &&
    Boolean(proposal.paidAt) &&
    Boolean(checkoutSessionId) &&
    !checkoutSessionId.startsWith("cs_test_") &&
    isLive
  );
}

export const hydrateEnrollmentIntakePrefill = onCall(async (req) => {
  if (!req.auth) {
    throw new HttpsError("unauthenticated", "Secure intake session required.");
  }

  const tokenId = clean(req.data?.tokenId).toLowerCase();
  if (!/^[a-z0-9]{6,32}$/.test(tokenId)) {
    throw new HttpsError("invalid-argument", "A valid intake token is required.");
  }

  const tokenRef = db.doc(`intakeTokens/${tokenId}`);
  const tokenSnap = await tokenRef.get();

  if (!tokenSnap.exists) {
    throw new HttpsError("not-found", "Intake invite not found.");
  }

  const token = tokenSnap.data() || {};
  const exp = typeof token.exp === "number" ? token.exp : null;

  if (token.used === true) {
    throw new HttpsError("failed-precondition", "Intake invite already used.");
  }

  if (exp && exp < Date.now()) {
    throw new HttpsError("failed-precondition", "Intake invite expired.");
  }

  if (
    clean(token.mode || "new_athlete").toLowerCase() !== "new_athlete" ||
    clean(token.source).toLowerCase() !== "management_enrollment"
  ) {
    throw new HttpsError("failed-precondition", "Unsupported intake invite.");
  }

  const proposalId = clean(token.proposalId);
  const locationId = clean(token.locationId);

  if (!proposalId || !locationId) {
    throw new HttpsError("failed-precondition", "Invite is missing enrollment ownership.");
  }

  const proposalSnap = await db.doc(`proposals/${proposalId}`).get();
  if (!proposalSnap.exists) {
    throw new HttpsError("not-found", "Paid enrollment proposal not found.");
  }

  const proposal = proposalSnap.data() || {};
  if (!isOperationalPaidProposal(proposal)) {
    throw new HttpsError("failed-precondition", "Enrollment proposal is not operationally paid.");
  }

  if (clean(proposal.locationId) !== locationId) {
    throw new HttpsError("failed-precondition", "Invite location does not match the paid proposal.");
  }

  const locked = asRecord(proposal.lockedSnapshot);
  const liveProspect = asRecord(proposal.prospect);
  const lockedProspect = asRecord(locked.prospect);
  const prospect = {
    ...liveProspect,
    ...lockedProspect,
  };

  const liveAthlete = firstAthlete(proposal.athletes);
  const lockedAthlete = firstAthlete(locked.athletes);
  const athlete = {
    ...liveAthlete,
    ...lockedAthlete,
  };

  const liveContact = asRecord(proposal.contact || proposal.parent);
  const lockedContact = asRecord(locked.contact || locked.parent);
  const contact = {
    ...liveContact,
    ...lockedContact,
  };

  const appointmentId = firstValue(
    prospect.appointmentId,
    liveProspect.appointmentId,
    lockedProspect.appointmentId,
    proposal.appointmentId
  );

  let appointment: Record<string, any> = {};
  let lead: Record<string, any> = {};

  if (appointmentId) {
    const appointmentSnap = await db
      .doc(`admissions_appointments/${appointmentId}`)
      .get();

    if (appointmentSnap.exists) {
      appointment = appointmentSnap.data() || {};

      const leadId = firstValue(
        appointment.leadId,
        prospect.leadId,
        proposal.leadId,
        proposal.connectLeadId
      );

      if (leadId) {
        const leadSnap = await db.doc(`interest_leads/${leadId}`).get();
        if (leadSnap.exists) lead = leadSnap.data() || {};
      }
    }
  }

  const existingPrefill = asRecord(token.prefill);
  const audience = clean(token.intakeAudience).toLowerCase();

  const athleteName = firstValue(
    athlete.name,
    athlete.fullName,
    athlete.athleteName,
    [athlete.first, athlete.last].filter(Boolean).join(" "),
    prospect.athleteName,
    appointment.athleteName,
    lead.athleteName,
    lead.participantName,
    existingPrefill.athleteName
  );

  const hydratedPrefill = Object.fromEntries(
    Object.entries({
      ...existingPrefill,
      athleteName,
      dob: firstValue(
        athlete.dob,
        athlete.dateOfBirth,
        prospect.dob,
        prospect.dateOfBirth,
        appointment.dob,
        appointment.dateOfBirth,
        lead.dob,
        lead.dateOfBirth,
        existingPrefill.dob
      ),
      city: firstValue(
        prospect.city,
        contact.city,
        appointment.city,
        lead.city,
        existingPrefill.city
      ),
      state: firstValue(
        prospect.state,
        contact.state,
        appointment.state,
        lead.state,
        existingPrefill.state
      ),
      email: firstValue(
        prospect.email,
        prospect.parentEmail,
        prospect.primaryContactEmail,
        contact.email,
        contact.parentEmail,
        appointment.email,
        lead.email,
        lead.parentEmail,
        existingPrefill.email
      ),
      phone: firstValue(
        prospect.phone,
        prospect.parentPhone,
        prospect.primaryContactPhone,
        contact.phone,
        contact.parentPhone,
        appointment.phone,
        lead.phone,
        lead.parentPhone,
        existingPrefill.phone
      ),
      parentName: audience === "parent_guardian"
        ? firstValue(
            prospect.primaryContactName,
            prospect.parentName,
            contact.name,
            contact.parentName,
            appointment.parentName,
            lead.parentName,
            lead.guardianName,
            existingPrefill.parentName
          )
        : existingPrefill.parentName || null,
      languagePreference: firstValue(
        prospect.languagePreference,
        prospect.preferredLanguage,
        contact.languagePreference,
        appointment.languagePreference,
        appointment.preferredLanguage,
        lead.languagePreference,
        lead.preferredLanguage,
        existingPrefill.languagePreference
      ),
    }).filter(([, value]) => value !== null && value !== undefined && value !== "")
  );

  await tokenRef.set(
    {
      prefill: hydratedPrefill,
      prefillHydratedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  return {
    ok: true,
    tokenId,
    prefill: hydratedPrefill,
  };
});
