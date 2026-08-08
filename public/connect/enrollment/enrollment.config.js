"use strict";

window.SandmanEnrollmentConfig = Object.freeze({
  version: "1.0.0",

  queryParams: Object.freeze({
    enrollmentToken: "token",
    proposalId: "proposalId",
    checkoutSessionId: "session_id"
  }),

  statuses: Object.freeze({
    READY_FOR_ENROLLMENT: "READY_FOR_ENROLLMENT",
    AGREEMENT_IN_PROGRESS: "AGREEMENT_IN_PROGRESS",
    READY_FOR_PAYMENT: "READY_FOR_PAYMENT",
    PAYMENT_PENDING: "PAYMENT_PENDING",
    PAID: "PAID",
    PAYMENT_NOT_REQUIRED: "PAYMENT_NOT_REQUIRED",
    COACH_CONFIRMED: "COACH_CONFIRMED",
    INTAKE_UNLOCKED: "INTAKE_UNLOCKED",
    INTAKE_SUBMITTED: "INTAKE_SUBMITTED",
    ACTIVATED: "ACTIVATED",
    COMPLETE: "COMPLETE"
  }),

  paymentStatuses: Object.freeze({
    NOT_STARTED: "NOT_STARTED",
    PAYMENT_PENDING: "PAYMENT_PENDING",
    PAID: "PAID",
    PAYMENT_NOT_REQUIRED: "PAYMENT_NOT_REQUIRED",
    FAILED: "FAILED"
  }),

  fundingRoutes: Object.freeze({
    STANDARD: "STANDARD",
    PARTNER_FUNDED: "PARTNER_FUNDED",
    SCHOLARSHIP_SPONSORED: "SCHOLARSHIP_SPONSORED"
  }),

  routes: Object.freeze({
    enrollment: "/connect/enrollment/",
    enrollmentSuccess: "/connect/enrollment/enrollment-success/",
    parentIntake: "/intake-parent/",
    coachIntake: "/intake-coach/",
    billingSuccess: "/billing/success/",
    home: "/"
  })
});