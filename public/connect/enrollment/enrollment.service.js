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

  const api = Object.freeze({
    getQueryParameters,
    loadEnrollment,
    saveAgreement,
    createCheckout
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