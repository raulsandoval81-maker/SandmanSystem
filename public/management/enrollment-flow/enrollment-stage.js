// Operational enrollment always precedes future recurring-billing setup.
// A prepaid membership can be paid while its first parent Intake is pending.
const upper = value => String(value ?? "").trim().toUpperCase();
const clean = value => String(value ?? "").trim();

export function enrollmentStage(proposal, intake) {
  const status = upper(proposal?.status);
  const billing = upper(proposal?.billingFollowUpStatus);
  const intakeStatus = upper(intake?.status);
  if (["VOID", "CLOSED"].includes(status)) {
    return {key:"CLOSED",label:"Closed",next:"No action"};
  }
  if (status === "READY_FOR_CHECKOUT") {
    return {key:"PAYMENT",label:"Awaiting checkout",next:"Complete Review & Confirm / payment"};
  }
  if (["CHECKOUT_CREATED", "PAYMENT_PENDING"].includes(status)) {
    return {key:"PAYMENT",label:"Payment pending",next:"Wait for payment"};
  }
  if (status === "PAID") {
    if (intakeStatus === "APPROVED" && clean(intake?.approvedUid)) {
      return {key:"ACTIVATION",label:"Athlete activated",next:"Review operational placement and outstanding follow-through"};
    }
    if (intakeStatus === "APPROVED") {
      return {key:"ACTIVATION",label:"Intake approved",next:"Complete athlete activation"};
    }
    if (["SUBMITTED", "REVIEW"].includes(intakeStatus)) {
      return {key:"INTAKE",label:"Intake submitted",next:"Management review"};
    }
    if (intakeStatus) {
      return {key:"INTAKE",label:"Intake in progress",next:"Complete intake handoff"};
    }
    return {key:"ENROLLMENT",label:"Paid / enrollment handoff",next:"Issue or send digital intake"};
  }
  if (billing === "RENEWAL_AUTOPAY_APPROVAL_REQUIRED" ||
      billing === "AUTOPAY_SETUP_REQUIRED") {
    return {key:"PAYMENT",label:"Prepaid renewal follow-up",next:"Verify payment and future renewal authorization"};
  }
  return {key:"ENROLLMENT",label:status || "Enrollment",next:"Review case"};
}
