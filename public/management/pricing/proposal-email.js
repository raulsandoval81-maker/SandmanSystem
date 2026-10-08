
  const memberText = athletes
    .map(
      (athlete) =>
        `${athlete.name}\n${memberDescription(athlete)}`
    )
    .join("\n\n");

  const firstName = String(athletes[0]?.name || "there")
    .trim()
    .split(/\s+/)[0];

  const confirmationLines = confirmationOptions.length
    ? [
        "------------------------------------------------------------",
        "",
        "PROPOSAL CONFIRMATION",
        "",
        "Please choose one:",
        "",
        ...confirmationOptions,
        "",
        "COPY + PASTE YOUR REPLY",
        "",
        "Selected Option: ______",
        "",
        "Example: Selected Option: A3",
        "",
        "Once I receive your selection, I’ll handle the next step."
      ]
    : [
        "------------------------------------------------------------",
        "",
        "PROPOSAL CONFIRMATION",
        "",
        "Please reply with the membership option you would like to move forward with.",
        "",
        "COPY + PASTE YOUR REPLY",
        "",
        "Selected Option: ______",
        "",
        "Once I receive your selection, I’ll handle the next step."
      ];

  const membershipNotes = [
    "This Membership Plan Proposal is not a final enrollment agreement. Your reply confirms your preferred membership option only. Final enrollment is completed in the next step.",
    "AAU or other governing-body membership is purchased separately where required.",
    competitionNote,
    "Sandman Academy membership fees are separate from any outside facility, program, or participation fees that may apply.",
    "Want more training later? When you’re ready for additional training time, talk with Coach or Management and we’ll review the next available option."
  ].filter(Boolean);

  return [
    `Hey ${firstName},`,
    "",
    "Below is your Sandman Academy Membership Plan Proposal with the available payment options for the plan you selected.",
    "",
    "Please review everything and reply with the option you would like to move forward with.",
    "",
    "Recurring membership payments are processed on the 5th of each month.",
    "",
    "Once you send your selection back, I’ll handle the next step from there.",
    "",
    "Thanks,",
    "Coach Sandoval",
    "Sandman Academy of Combat & Fitness™",
    "",
    "------------------------------------------------------------",
    "",
    "Sandman Academy of Combat & Fitness™",
    "Membership Plan Proposal",
    "",
    memberText,
    "",
    "Selected Plan Pricing",
    ...pricingLines,
    `Annual Enrollment: ${money(annualEnrollment)}`,
    "",
    "Savings",
    `6-Month: Save ${money(
      sixMonthSavings
    )}/month compared with month-to-month.`,
    `12-Month: Save ${money(
      annualMonthlySavings
    )}/month compared with month-to-month.`,
    `12-Month Annual Savings: ${money(annualSavings)}`,
    "",
    ...confirmationLines,
    "",
    "------------------------------------------------------------",
    "",
    "Membership Notes",
    "",
    ...membershipNotes
  ].join("\n");
}

async function collectedEmail() {
  if (!appointmentId) return "";

  const snapshot = await getDoc(
    doc(db, "admissions_appointments", appointmentId)
  );

  if (!snapshot.exists()) return "";

  const appointment = snapshot.data();

  return String(
    appointment.email || appointment.parentEmail || ""
  ).trim();
}

sendButton?.addEventListener(
  "click",
  async (event) => {
    event.preventDefault();
    event.stopImmediatePropagation();

    const recipient = await collectedEmail();

    if (!recipient) {
      if (pricingSourceStatus) {
        pricingSourceStatus.textContent =
          "No email was collected for this admissions record.";
      }
      return;
    }

    const athletes = readAthletes();
    const body = buildProposalEmail(athletes);
    const subject = "Sandman Academy Membership Plan Proposal";

    window.location.href =
      `mailto:${recipient}` +
      `?subject=${encodeURIComponent(subject)}` +
      `&body=${encodeURIComponent(body)}`;
  },
  { capture: true }
);
