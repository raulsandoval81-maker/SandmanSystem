"use strict";

import {
  functions,
  httpsCallable
} from "/assets/js/firebase-init.js";

(function () {
  const config = window.SandmanEnrollmentConfig;

  if (!config) {
    throw new Error("Sandman Enrollment configuration was not loaded.");
  }

  async function callFunction(functionName, payload = {}) {
    const callable =
      httpsCallable(
        functions,
        functionName
      );

    const response =
      await callable(payload);

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

  function requireEnrollmentContext() {
    const {
      enrollmentToken,
      proposalId
    } = getQueryParameters();

    if (
      !enrollmentToken ||
      !proposalId
    ) {
      throw new Error(
        "A complete secure enrollment verification link is required."
      );
    }

    return {
      enrollmentToken,
      proposalId
    };
  }

  async function loadEnrollment() {
    const {
      enrollmentToken,
      proposalId
    } = requireEnrollmentContext();

    return callFunction(
      "getProposalEnrollment",
      {
        proposalId,
        enrollmentToken
      }
    );
  }

  async function saveAgreement(agreement) {
    const {
      enrollmentToken,
      proposalId
    } = requireEnrollmentContext();

    return callFunction(
      "saveProposalEnrollmentAgreement",
      {
        proposalId,
        enrollmentToken,
        agreement
      }
    );
  }

  async function createCheckout() {
    const {
      enrollmentToken,
      proposalId
    } = requireEnrollmentContext();

    return callFunction(
      "createProposalCheckout",
      {
        proposalId,
        enrollmentToken
      }
    );
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
    const { enrollmentToken } = requireEnrollmentContext();

    return callFunction("confirmEnrollment", {
      enrollmentToken
    });
  }

  async function createIntakeHandoff() {
    const { enrollmentToken } = requireEnrollmentContext();

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

  const api = Object.freeze({
    getQueryParameters,
    loadEnrollment,
    saveAgreement,
    createCheckout,
    verifyCheckoutReturn,
    confirmEnrollment,
    createIntakeHandoff,
    openParentIntake
  });

  window.SandmanEnrollmentService =
    api;

  window.dispatchEvent(
    new CustomEvent(
      "sandman:enrollment-service-ready"
    )
  );
})();

export const SandmanEnrollmentService =
  window.SandmanEnrollmentService;