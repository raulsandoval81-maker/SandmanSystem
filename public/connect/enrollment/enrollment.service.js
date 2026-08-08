"use strict";

(function () {
  const config = window.SandmanEnrollmentConfig;

  if (!config) {
    throw new Error("Sandman Enrollment configuration was not loaded.");
  }

  function requireFirebase() {
    if (!window.firebase) {
      throw new Error("Firebase SDK was not loaded.");
    }

    if (typeof window.firebase.functions !== "function") {
      throw new Error("Firebase Functions SDK was not loaded.");
    }

    return window.firebase.functions();
  }

  async function callFunction(functionName, payload = {}) {
    const functions = requireFirebase();
    const callable = functions.httpsCallable(functionName);
    const response = await callable(payload);

    return response.data;
  }

  function getQueryParameters() {
    const params = new URLSearchParams(window.location.search);

    return {
      enrollmentToken: params.get(config.queryParams.enrollmentToken),
      proposalId: params.get(config.queryParams.proposalId),
      checkoutSessionId: params.get(
        config.queryParams.checkoutSessionId
      )
    };
  }

  function requireEnrollmentToken() {
    const { enrollmentToken } = getQueryParameters();

    if (!enrollmentToken) {
      throw new Error("A secure enrollment token is required.");
    }

    return enrollmentToken;
  }

  async function loadEnrollment() {
    const enrollmentToken = requireEnrollmentToken();

    return callFunction("getEnrollmentByToken", {
      enrollmentToken
    });
  }

  async function saveAgreement(agreement) {
    const enrollmentToken = requireEnrollmentToken();

    return callFunction("saveEnrollmentAgreement", {
      enrollmentToken,
      agreement
    });
  }

  async function createCheckout() {
    const enrollmentToken = requireEnrollmentToken();

    return callFunction("createEnrollmentCheckout", {
      enrollmentToken
    });
  }

  async function verifyCheckoutReturn() {
    const {
      enrollmentToken,
      checkoutSessionId
    } = getQueryParameters();

    if (!enrollmentToken) {
      throw new Error("A secure enrollment token is required.");
    }

    if (!checkoutSessionId) {
      throw new Error("A Stripe Checkout Session ID is required.");
    }

    return callFunction("verifyEnrollmentCheckout", {
      enrollmentToken,
      checkoutSessionId
    });
  }

  async function confirmEnrollment() {
    const enrollmentToken = requireEnrollmentToken();

    return callFunction("confirmEnrollment", {
      enrollmentToken
    });
  }

  async function createIntakeHandoff() {
    const enrollmentToken = requireEnrollmentToken();

    return callFunction("createEnrollmentIntakeHandoff", {
      enrollmentToken
    });
  }

  function openParentIntake(intakeTokenId) {
    if (!intakeTokenId) {
      throw new Error("An Intake token is required.");
    }

    const url = new URL(
      config.routes.parentIntake,
      window.location.origin
    );

    url.searchParams.set("invite", intakeTokenId);
    window.location.assign(url.toString());
  }

  window.SandmanEnrollmentService = Object.freeze({
    getQueryParameters,
    loadEnrollment,
    saveAgreement,
    createCheckout,
    verifyCheckoutReturn,
    confirmEnrollment,
    createIntakeHandoff,
    openParentIntake
  });
})();