"use strict";

(function () {
  const service = window.SandmanEnrollmentService;

  if (!service) {
    throw new Error("Sandman Enrollment service was not loaded.");
  }

  const elements = {};
  let verificationInProgress = false;

  document.addEventListener("DOMContentLoaded", initialize);

  function initialize() {
    collectElements();
    bindEvents();
    verifyPayment();
  }

  function collectElements() {
    elements.loading = document.getElementById(
      "verificationLoading"
    );

    elements.success = document.getElementById(
      "verificationSuccess"
    );

    elements.pending = document.getElementById(
      "verificationPending"
    );

    elements.error = document.getElementById(
      "verificationError"
    );

    elements.errorMessage = document.getElementById(
      "verificationErrorMessage"
    );

    elements.returnToEnrollmentButton = document.getElementById(
      "returnToEnrollmentButton"
    );

    elements.retryVerificationButton = document.getElementById(
      "retryVerificationButton"
    );

    elements.returnFromPendingButton = document.getElementById(
      "returnFromPendingButton"
    );

    elements.retryAfterErrorButton = document.getElementById(
      "retryAfterErrorButton"
    );

    elements.returnAfterErrorButton = document.getElementById(
      "returnAfterErrorButton"
    );
  }

  function bindEvents() {
    elements.returnToEnrollmentButton.addEventListener(
      "click",
      returnToEnrollment
    );

    elements.retryVerificationButton.addEventListener(
      "click",
      verifyPayment
    );

    elements.returnFromPendingButton.addEventListener(
      "click",
      returnToEnrollment
    );

    elements.retryAfterErrorButton.addEventListener(
      "click",
      verifyPayment
    );

    elements.returnAfterErrorButton.addEventListener(
      "click",
      returnToEnrollment
    );
  }

  async function verifyPayment() {
    if (verificationInProgress) {
      return;
    }

    const params = new URLSearchParams(window.location.search);

    const token =
      params.get("token") ||
      params.get("enrollmentToken");

    const sessionId =
      params.get("session_id") ||
      params.get("sessionId");

    if (!token) {
      showError(
        "The secure enrollment token is missing from this link."
      );
      return;
    }

    if (!sessionId) {
      showError(
        "The Stripe Checkout Session ID is missing from this link."
      );
      return;
    }

    verificationInProgress = true;
    showState("loading");
    setRetryButtonsBusy(true);

    try {
      const response = await service.verifyCheckoutReturn();

      const result = normalizeResponse(response);

      if (isVerified(result)) {
        showState("success");
        return;
      }

      if (isPending(result)) {
        showState("pending");
        return;
      }

      throw new Error(
        result.message ||
          "Stripe did not report this payment as completed."
      );
    } catch (error) {
      showError(getErrorMessage(error));
    } finally {
      verificationInProgress = false;
      setRetryButtonsBusy(false);
    }
  }

  function normalizeResponse(response) {
    if (!response || typeof response !== "object") {
      throw new Error(
        "The payment-verification response was empty."
      );
    }

    return response.enrollment || response;
  }

  function isVerified(result) {
    const status = String(
      result.paymentStatus ||
        result.payment?.status ||
        result.status ||
        ""
    ).toUpperCase();

    return (
      result.verified === true ||
      result.paid === true ||
      status === "PAID" ||
      status === "PAYMENT_VERIFIED" ||
      status === "COACH_CONFIRMED" ||
      status === "INTAKE_UNLOCKED" ||
      status === "INTAKE_SUBMITTED" ||
      status === "ACTIVATED" ||
      status === "COMPLETE"
    );
  }

  function isPending(result) {
    const status = String(
      result.paymentStatus ||
        result.payment?.status ||
        result.status ||
        ""
    ).toUpperCase();

    return (
      result.pending === true ||
      status === "PENDING" ||
      status === "PROCESSING" ||
      status === "PAYMENT_PENDING" ||
      status === "CHECKOUT_CREATED"
    );
  }

  function returnToEnrollment() {
    const params = new URLSearchParams(window.location.search);

    const token =
      params.get("token") ||
      params.get("enrollmentToken");

    if (!token) {
      showError(
        "The secure enrollment token is unavailable. Contact your coach for a new enrollment link."
      );
      return;
    }

    const enrollmentUrl = new URL(
      "/connect/enrollment/",
      window.location.origin
    );

    enrollmentUrl.searchParams.set("token", token);

    window.location.assign(enrollmentUrl.toString());
  }

  function showState(stateName) {
    elements.loading.hidden = stateName !== "loading";
    elements.success.hidden = stateName !== "success";
    elements.pending.hidden = stateName !== "pending";
    elements.error.hidden = stateName !== "error";
  }

  function showError(message) {
    elements.errorMessage.textContent = message;
    showState("error");
  }

  function setRetryButtonsBusy(isBusy) {
    const buttons = [
      elements.retryVerificationButton,
      elements.retryAfterErrorButton
    ];

    buttons.forEach(function (button) {
      if (!button) {
        return;
      }

      button.disabled = isBusy;
      button.textContent = isBusy
        ? "Verifying..."
        : button.dataset.originalLabel;
    });
  }

  function getErrorMessage(error) {
    if (!error) {
      return "An unexpected payment-verification error occurred.";
    }

    if (typeof error === "string") {
      return error;
    }

    if (error.message) {
      return error.message;
    }

    return "An unexpected payment-verification error occurred.";
  }

  elementsReadyLabels();

  function elementsReadyLabels() {
    document.addEventListener("DOMContentLoaded", function () {
      const retryButtons = [
        document.getElementById("retryVerificationButton"),
        document.getElementById("retryAfterErrorButton")
      ];

      retryButtons.forEach(function (button) {
        if (button) {
          button.dataset.originalLabel = button.textContent;
        }
      });
    });
  }
})();