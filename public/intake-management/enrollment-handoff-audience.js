import {
  db,
  collection,
  doc,
  getDoc,
  getDocs,
  functions,
  httpsCallable,
  setDoc,
  serverTimestamp,
} from "/assets/js/firebase-init.js";

const INVITE_HOURS = 48;

function clean(value) {
  return String(value ?? "").trim();
}

function normalizeRole(value) {
  return clean(value).toLowerCase().replace(/[-\s]+/g, "_");
}

function ageFromDob(value) {
  const raw = clean(value);
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const birth = new Date(year, month - 1, day);

  if (
    birth.getFullYear() !== year ||
    birth.getMonth() !== month - 1 ||
    birth.getDate() !== day
  ) return null;

  const now = new Date();
  let age = now.getFullYear() - year;
  const monthDiff = now.getMonth() - (month - 1);
  if (
    monthDiff < 0 ||
    (monthDiff === 0 && now.getDate() < day)
  ) age -= 1;

  return age >= 0 && age < 130 ? age : null;
}

function numericAge(value) {
  const age = Number(clean(value));
  return Number.isInteger(age) && age >= 0 && age < 130
    ? age
    : null;
}

function firstValue(...values) {
  for (const value of values) {
    const normalized = clean(value);
    if (normalized) return normalized;
  }
  return "";
}

function proposalAthlete(proposal = {}) {
  const liveAthlete =
    proposal.athletes?.[0] || {};

  const lockedAthlete =
    proposal.lockedSnapshot?.athletes?.[0] || {};

  return {
    ...liveAthlete,
    ...lockedAthlete,
  };
}

function proposalProspect(proposal = {}) {
  return {
    ...(proposal.prospect || {}),
    ...(proposal.lockedSnapshot?.prospect || {}),
  };
}

function inferAudience(proposal = {}) {
  const athlete = proposalAthlete(proposal);
  const prospect = proposalProspect(proposal);

  const explicit = normalizeRole(firstValue(
    proposal.intakeAudience,
    proposal.registrantRole,
    proposal.lockedSnapshot?.intakeAudience,
    proposal.lockedSnapshot?.registrantRole,
    athlete.intakeAudience,
    athlete.registrantRole,
    prospect.intakeAudience,
    prospect.registrantRole
  ));

  if (["adult_athlete", "adultathlete"].includes(explicit)) {
    return "adult_athlete";
  }

  if ([
    "parent_guardian",
    "parent",
    "guardian",
    "parent_or_guardian"
  ].includes(explicit)) {
    return "parent_guardian";
  }

  const dob = firstValue(
    athlete.dob,
    athlete.dateOfBirth,
    prospect.dob,
    prospect.dateOfBirth,
    proposal.dob,
    proposal.dateOfBirth
  );

  const age = ageFromDob(dob);
  if (age !== null) {
    return age >= 18 ? "adult_athlete" : "parent_guardian";
  }

  return "unknown";
}

function labelForAudience(audience) {
  if (audience === "adult_athlete") return "Adult Athlete";
  if (audience === "parent_guardian") return "Parent / Guardian";
  return "Parent / Guardian / Athlete";
}

async function resolveLead(proposal = {}) {
  const prospect = proposalProspect(proposal);
  const appointmentId = firstValue(
    prospect.appointmentId,
    proposal.appointmentId
  );

  let leadId = firstValue(
    prospect.leadId,
    proposal.leadId,
    proposal.connectLeadId
  );

  let appointment = {};
  let lead = {};

  if (appointmentId) {
    const appointmentSnap = await getDoc(
      doc(db, "admissions_appointments", appointmentId)
    );
    if (appointmentSnap.exists()) {
      appointment = appointmentSnap.data() || {};
      if (!leadId) {
        leadId = firstValue(
          appointment.leadId,
          appointment.appointmentId,
          appointmentId
        );
      }
    }
  }

  if (leadId) {
    const leadSnap = await getDoc(doc(db, "interest_leads", leadId));
    if (leadSnap.exists()) {
      lead = leadSnap.data() || {};
    }
  }

  return { leadId, lead, appointment };
}

async function inferAudienceWithLead(proposal = {}) {
  try {
    const { lead, appointment } = await resolveLead(proposal);

    const appointmentExplicit = normalizeRole(firstValue(
      appointment.intakeAudience,
      appointment.registrantRole
    ));

    if (["adult_athlete", "adultathlete"].includes(appointmentExplicit)) {
      return "adult_athlete";
    }
    if ([
      "parent_guardian",
      "parent",
      "guardian",
      "parent_or_guardian"
    ].includes(appointmentExplicit)) {
      return "parent_guardian";
    }

    const appointmentAge =
      ageFromDob(firstValue(
        appointment.dob,
        appointment.dateOfBirth
      )) ??
      numericAge(
        appointment.athleteAge
      );

    if (appointmentAge !== null) {
      return appointmentAge >= 18 ? "adult_athlete" : "parent_guardian";
    }

    const explicit = normalizeRole(firstValue(
      lead.intakeAudience,
      lead.registrantRole
    ));

    if (["adult_athlete", "adultathlete"].includes(explicit)) {
      return "adult_athlete";
    }
    if ([
      "parent_guardian",
      "parent",
      "guardian",
      "parent_or_guardian"
    ].includes(explicit)) {
      return "parent_guardian";
    }

    const age =
      ageFromDob(firstValue(
        lead.dob,
        lead.dateOfBirth
      )) ??
      numericAge(
        lead.athleteAge
      );

    if (age !== null) {
      return age >= 18 ? "adult_athlete" : "parent_guardian";
    }

    const direct = inferAudience(proposal);
    if (direct !== "unknown") {
      return direct;
    }

    const athlete = proposalAthlete(proposal);
    const prospect = proposalProspect(proposal);
    const enrollmentType = normalizeRole(firstValue(
      athlete.enrollmentType,
      prospect.enrollmentType,
      proposal.enrollmentType
    ));

    if (["adult", "adult_athlete", "adultathlete"].includes(enrollmentType)) {
      return "adult_athlete";
    }

    if (["youth", "minor", "child"].includes(enrollmentType)) {
      return "parent_guardian";
    }
  } catch (error) {
    console.warn("[enrollment-handoff-audience] lead lookup failed:", error);
  }

  const direct = inferAudience(proposal);
  if (direct !== "unknown") {
    return direct;
  }

  const athlete = proposalAthlete(proposal);
  const prospect = proposalProspect(proposal);
  const enrollmentType = normalizeRole(firstValue(
    athlete.enrollmentType,
    prospect.enrollmentType,
    proposal.enrollmentType
  ));

  if (["adult", "adult_athlete", "adultathlete"].includes(enrollmentType)) {
    return "adult_athlete";
  }

  if (["youth", "minor", "child"].includes(enrollmentType)) {
    return "parent_guardian";
  }

  return "unknown";
}

async function supersedeOppositeInvite(proposalId, audience) {
  const opposite =
    audience === "adult_athlete"
      ? "parent_guardian"
      : "adult_athlete";

  const historySnapshot = await getDocs(
    collection(db, "proposals", proposalId, "history")
  );

  const tokenIds = historySnapshot.docs
    .map((historyDoc) => historyDoc.data() || {})
    .filter((record) =>
      clean(record.event).toUpperCase() === "INTAKE_INVITE_CREATED" &&
      normalizeRole(record.intakeAudience) === opposite &&
      clean(record.intakeTokenId)
    )
    .map((record) => clean(record.intakeTokenId));

  for (const tokenId of tokenIds) {
    const tokenRef = doc(db, "intakeTokens", tokenId);
    const tokenSnap = await getDoc(tokenRef);
    if (!tokenSnap.exists()) continue;

    const token = tokenSnap.data() || {};
    if (
      clean(token.proposalId) !== proposalId ||
      normalizeRole(token.intakeAudience) !== opposite ||
      clean(token.source).toLowerCase() !== "management_enrollment" ||
      token.used === true
    ) {
      continue;
    }

    await setDoc(
      tokenRef,
      {
        used: true,
        status: "superseded",
        supersededAt: serverTimestamp(),
        supersededByAudience: audience,
        updatedAt: serverTimestamp()
      },
      { merge: true }
    );
  }
}

async function createInvite(proposal, audience) {
  const proposalId = clean(proposal.proposalId || proposal.id);
  if (!proposalId) throw new Error("Paid enrollment is missing its proposal ID.");

  if (audience === "unknown") {
    throw new Error(
      "Unable to determine whether this intake belongs to a Parent / Guardian or an Adult Athlete. Verify the athlete DOB or registrant role first."
    );
  }

  await supersedeOppositeInvite(proposalId, audience);

  const athlete = proposalAthlete(proposal);
  const prospect = proposalProspect(proposal);
  const contact =
    proposal.lockedSnapshot?.contact ||
    proposal.contact ||
    proposal.lockedSnapshot?.parent ||
    proposal.parent ||
    {};
  const { leadId, lead } = await resolveLead(proposal);

  const tokenId = crypto.randomUUID().replace(/-/g, "").slice(0, 16);
  const exp = Date.now() + INVITE_HOURS * 60 * 60 * 1000;

  const athleteName = firstValue(
    athlete.name,
    athlete.fullName,
    athlete.athleteName,
    [athlete.first, athlete.last].filter(Boolean).join(" "),
    prospect.athleteName,
    proposal.athleteName,
    lead.athleteName,
    lead.participantName
  );

  const prefill = Object.fromEntries(
    Object.entries({
      athleteName,
      parentName: firstValue(
        prospect.primaryContactName,
        prospect.parentName,
        contact.name,
        contact.parentName,
        proposal.parentName,
        lead.parentName,
        lead.guardianName
      ),
      dob: firstValue(
        athlete.dob,
        athlete.dateOfBirth,
        prospect.dob,
        prospect.dateOfBirth,
        proposal.dob,
        proposal.dateOfBirth,
        lead.dob,
        lead.dateOfBirth
      ),
      city: firstValue(prospect.city, contact.city, proposal.city, lead.city),
      state: firstValue(prospect.state, contact.state, proposal.state, lead.state),
      email: firstValue(
        prospect.email,
        prospect.parentEmail,
        prospect.primaryContactEmail,
        contact.email,
        contact.parentEmail,
        proposal.email,
        proposal.parentEmail,
        lead.email,
        lead.parentEmail
      ),
      phone: firstValue(
        prospect.phone,
        prospect.parentPhone,
        prospect.primaryContactPhone,
        contact.phone,
        contact.parentPhone,
        proposal.phone,
        proposal.parentPhone,
        lead.phone,
        lead.parentPhone
      ),
      languagePreference: firstValue(
        prospect.languagePreference,
        prospect.preferredLanguage,
        contact.languagePreference,
        proposal.languagePreference
      )
    }).filter(([, value]) => value)
  );

  await setDoc(doc(db, "intakeTokens", tokenId), {
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    exp,
    used: false,
    status: "invited",
    mode: "new_athlete",
    intakeAudience: audience,
    intakeRoute: audience === "adult_athlete" ? "athlete" : "parent",
    existingAthleteUid: "",
    forTrack: null,
    forLane: null,
    requestedTrackCode: null,
    requestedDiscipline: null,
    existingAthleteName: null,
    proposalId,
    connectLeadId: leadId || null,
    locationId: clean(proposal.locationId) || null,
    prefill,
    source: "management_enrollment",
    workflowVersion: "intake-v2"
  });

  const route = audience === "adult_athlete"
    ? "/intake-athlete/"
    : "/intake-parent/";
  const url = `${location.origin}${route}?invite=${encodeURIComponent(tokenId)}`;

  const inviteLink = document.getElementById("invite-link");
  const routeLabel = document.getElementById("invite-route-label");
  const inviteStatus = document.getElementById("invite-status");

  if (inviteLink) inviteLink.value = url;
  if (routeLabel) {
    routeLabel.textContent = audience === "adult_athlete"
      ? "Adult Athlete Intake → /intake-athlete/"
      : "Parent / Guardian Intake → /intake-parent/";
  }
  if (inviteStatus) {
    inviteStatus.textContent = `✓ ${labelForAudience(audience)} intake created (${INVITE_HOURS}h).`;
  }
}

async function normalizeCard(card) {
  const proposalId = clean(card.dataset.readyProposal);
  if (!proposalId || card.dataset.audienceNormalized === "true") return;

  const snap = await getDoc(doc(db, "proposals", proposalId));
  if (!snap.exists()) return;

  const proposal = { id: snap.id, ...snap.data() };
  const audience = await inferAudienceWithLead(proposal);
  const actions = card.querySelector(".pending-card-actions");
  if (!actions) return;

  // If the proposal does not contain enough authoritative data to infer
  // Parent/Guardian vs Adult Athlete, keep the Enrollment page's explicit
  // two-choice fallback instead of replacing it with an unusable ambiguous
  // button. Management can then choose the correct intake owner.
  if (audience === "unknown") {
    card.dataset.audienceNormalized = "true";
    return;
  }

  const button = document.createElement("button");
  button.type = "button";
  button.className = "small solid-blue";
  button.textContent = labelForAudience(audience);
  button.dataset.resolvedAudience = audience;

  button.addEventListener("click", async () => {
    if (button.disabled) return;
    const original = button.textContent;
    button.disabled = true;
    button.textContent = "Opening…";
    try {
      await createInvite(proposal, audience);
    } catch (error) {
      console.error("[enrollment-handoff-audience] invite failed:", error);
      window.alert(error?.message || "Unable to create intake invite.");
    } finally {
      button.disabled = false;
      button.textContent = original;
    }
  });

  actions.replaceChildren(button);
  card.dataset.audienceNormalized = "true";
}

async function normalizeReadyCards() {
  const cards = [...document.querySelectorAll("[data-ready-proposal]")];
  await Promise.all(cards.map((card) => normalizeCard(card)));
}

async function boot() {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const cards = document.querySelectorAll("[data-ready-proposal]");
    if (cards.length) {
      await normalizeReadyCards();
      return;
    }
    await new Promise((resolve) => window.setTimeout(resolve, 250));
  }
}

boot().catch((error) => {
  console.error("[enrollment-handoff-audience] boot failed:", error);
});
