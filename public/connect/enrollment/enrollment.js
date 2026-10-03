"use strict";

import {
  SandmanEnrollmentService as service
} from "./enrollment.service.js?v=20261002-4";

(function () {
  const config = window.SandmanEnrollmentConfig;

  if (!config) {
    throw new Error("Sandman Enrollment configuration was not loaded.");
  }

  if (!service) {
    throw new Error("Sandman Enrollment service was not loaded.");
  }

  const state = {
    enrollment: null,
    currentStep: "summary"
  };

  const elements = {};

  document.addEventListener("DOMContentLoaded", initialize);

  function initialize() {
    collectElements();
    bindEvents();
    loadEnrollment();
  }

  function collectElements() {
    elements.loading = document.getElementById("enrollmentLoading");
    elements.error = document.getElementById("enrollmentError");
    elements.errorMessage = document.getElementById(
      "enrollmentErrorMessage"
    );
    elements.app = document.getElementById("enrollmentApp");
    elements.notice = document.getElementById("enrollmentNotice");

    elements.familyName = document.getElementById("familyName");
    elements.primaryContactName = document.getElementById(
      "primaryContactName"
    );
    elements.athleteList = document.getElementById("athleteList");
    elements.dueNowAmount = document.getElementById("dueNowAmount");
    elements.monthlyAmount = document.getElementById("monthlyAmount");
    elements.annualRenewalAmount = document.getElementById(
      "annualRenewalAmount"
    );
    elements.fundingRoute = document.getElementById("fundingRoute");

    elements.agreementForm = document.getElementById("agreementForm");
    elements.termsConfirmed = document.getElementById(
      "termsConfirmed"
    );

    elements.paymentMessage = document.getElementById("paymentMessage");
    elements.paymentStatus = document.getElementById("paymentStatus");
    elements.continueToAgreementButton = document.getElementById(
      "continueToAgreementButton"
    );
    elements.backToSummaryButton = document.getElementById(
      "backToSummaryButton"
    );
    elements.backToAgreementButton = document.getElementById(
      "backToAgreementButton"
    );
    elements.checkoutButton = document.getElementById("checkoutButton");
  }

  function bindEvents() {
    elements.continueToAgreementButton.addEventListener(
      "click",
      function () {
        showStep("agreement");
      }
    );

    elements.backToSummaryButton.addEventListener("click", function () {
      showStep("summary");
    });

    elements.backToAgreementButton.addEventListener(
      "click",
      function () {
        showStep("agreement");
      }
    );

    elements.agreementForm.addEventListener(
      "submit",
      handleAgreementSubmit
    );

    elements.checkoutButton.addEventListener(
      "click",
      handleCheckout
    );

  }

  async function loadEnrollment() {
    setLoading(true);

    try {
      const response = await service.loadEnrollment();
      state.enrollment = normalizeEnrollment(response);

      renderEnrollment();
      setLoading(false);
      elements.app.hidden = false;

      restoreCorrectStep();
    } catch (error) {
      showFatalError(error);
    }
  }

  function normalizeEnrollment(response) {
    if (!response || typeof response !== "object") {
      throw new Error("The enrollment response was empty.");
    }

    return response.enrollment || response;
  }

  function renderEnrollment() {
    const enrollment = state.enrollment;
    const prospect = enrollment.prospect || {};
    const pricing = enrollment.pricing || {};
    const confirmation = enrollment.confirmation || {};

    elements.familyName.textContent =
      prospect.familyName ||
      enrollment.familyName ||
      "Not provided";

    elements.primaryContactName.textContent =
      prospect.primaryContactName ||
      enrollment.primaryContactName ||
      "Not provided";

    renderAthletes(enrollment.athletes || []);

    elements.dueNowAmount.textContent = formatMoney(
      getAmount(pricing, ["dueNow", "dueNowAmount"])
    );

    elements.monthlyAmount.textContent = formatMoney(
      getAmount(pricing, [
        "monthlyBalance",
        "monthlyAmount",
        "familyMonthlyResponsibility"
      ])
    );

    elements.annualRenewalAmount.textContent = formatMoney(
      getAmount(pricing, [
        "annualRenewal",
        "annualRenewalAmount"
      ])
    );

    elements.fundingRoute.textContent = formatFundingRoute(
      enrollment.fundingRoute ||
      pricing.fundingRoute ||
      config.fundingRoutes.STANDARD
    );

    elements.termsConfirmed.checked =
      confirmation.termsConfirmed === true;

    renderPaymentState();
  }

  function renderAthletes(athletes) {
    elements.athleteList.replaceChildren();

    if (!athletes.length) {
      const message = document.createElement("p");
      message.textContent = "No athletes were included.";
      elements.athleteList.appendChild(message);
      return;
    }

    const list = document.createElement("ul");
    list.className = "enrollment-athlete-list";

    athletes.forEach(function (athlete) {
      const item = document.createElement("li");
      const name = athlete.name || athlete.athleteName || "Athlete";

      const program =
        athlete.programName ||
        athlete.program ||
        athlete.journey ||
        athlete.track ||
        "Program pending";

      const discipline =
        athlete.disciplineName ||
        athlete.discipline ||
        athlete.lane ||
        "";

      item.textContent = discipline
        ? name + " — " + program + " · " + discipline
        : name + " — " + program;

      list.appendChild(item);
    });

    elements.athleteList.appendChild(list);
  }

  function renderPaymentState() {
    const enrollment = state.enrollment;
    const status = getPaymentStatus(enrollment);
    const paymentRequired = isPaymentRequired(enrollment);

    if (!paymentRequired) {
      elements.paymentMessage.textContent =
        "No family payment is required for this enrollment.";

      elements.paymentStatus.textContent =
        "Payment not required";

      elements.checkoutButton.hidden = true;
      elements.backToAgreementButton.hidden = false;
      return;
    }

    elements.checkoutButton.hidden = false;

    if (status === config.paymentStatuses.PAID) {
      elements.paymentMessage.textContent =
        "Your payment has been securely verified.";

      elements.paymentStatus.textContent = "Payment verified";
      elements.checkoutButton.hidden = true;
      return;
    }

    if (status === config.paymentStatuses.PAYMENT_PENDING) {
      elements.paymentMessage.textContent =
        "Your secure checkout is open. Payment verification is pending.";

      elements.paymentStatus.textContent =
        "Waiting for payment verification";

      elements.checkoutButton.textContent =
        "Return to Secure Checkout";

      return;
    }

    if (status === config.paymentStatuses.FAILED) {
      elements.paymentMessage.textContent =
        "Payment was not completed. You may try again.";

      elements.paymentStatus.textContent = "Payment incomplete";
      elements.checkoutButton.textContent =
        "Try Secure Checkout Again";

      return;
    }

    elements.paymentMessage.textContent =
      "Your billing summary is ready for secure payment.";

    elements.paymentStatus.textContent = "Payment not started";
    elements.checkoutButton.textContent =
      "Continue to Secure Checkout";
  }

  function restoreCorrectStep() {
    const status = state.enrollment.status;

    if (
      status === config.statuses.READY_FOR_PAYMENT ||
      status === config.statuses.PAYMENT_PENDING ||
      status === config.statuses.PAID ||
      status === config.statuses.PAYMENT_NOT_REQUIRED
    ) {
      showStep("payment");
      return;
    }

    if (status === config.statuses.AGREEMENT_IN_PROGRESS) {
      showStep("summary");
      return;
    }

    if (status === config.statuses.READY_FOR_ENROLLMENT) {
      showStep("summary");
      return;
    }

    showStep("summary");
  }

  function showStep(stepName) {
    state.currentStep = stepName;

    document
      .querySelectorAll("[data-panel]")
      .forEach(function (panel) {
        panel.hidden = panel.dataset.panel !== stepName;
      });

    document
      .querySelectorAll("[data-step]")
      .forEach(function (step) {
        const isCurrent = step.dataset.step === stepName;

        if (isCurrent) {
          step.setAttribute("aria-current", "step");
        } else {
          step.removeAttribute("aria-current");
        }
      });

    clearNotice();

    window.scrollTo({
      top: 0,
      behavior: "smooth"
    });
  }

  async function handleAgreementSubmit(event) {
    event.preventDefault();

    if (!elements.agreementForm.reportValidity()) {
      return;
    }

    const confirmation = {
      termsConfirmed:
        elements.termsConfirmed.checked
    };

    setButtonBusy(
      elements.agreementForm.querySelector('[type="submit"]'),
      true,
      "Confirming..."
    );

    try {
      const response =
        await service.saveConfirmation(
          confirmation
        );

      state.enrollment =
        normalizeEnrollment(response);

      renderEnrollment();
      showStep("payment");
    } catch (error) {
      showNotice(
        getErrorMessage(error),
        true
      );
    } finally {
      setButtonBusy(
        elements.agreementForm.querySelector('[type="submit"]'),
        false
      );
    }
  }

  async function handleCheckout() {
    setButtonBusy(
      elements.checkoutButton,
      true,
      "Opening Checkout..."
    );

    try {
      const response = await service.createCheckout();
      const checkoutUrl =
        response.checkoutUrl ||
        response.url;

      if (!checkoutUrl) {
        throw new Error(
          "The backend did not return a Stripe Checkout URL."
        );
      }

      window.location.assign(checkoutUrl);
    } catch (error) {
      showNotice(getErrorMessage(error), true);
      setButtonBusy(elements.checkoutButton, false);
    }
  }

  function getPaymentStatus(enrollment) {
    return (
      enrollment.paymentStatus ||
      enrollment.payment?.status ||
      config.paymentStatuses.NOT_STARTED
    );
  }

  function isPaymentRequired(enrollment) {
    if (
      enrollment.paymentRequired === false ||
      getPaymentStatus(enrollment) ===
        config.paymentStatuses.PAYMENT_NOT_REQUIRED ||
      enrollment.status === config.statuses.PAYMENT_NOT_REQUIRED
    ) {
      return false;
    }

    return true;
  }

  function isPaymentComplete(enrollment) {
    const paymentStatus = getPaymentStatus(enrollment);

    return (
      paymentStatus === config.paymentStatuses.PAID ||
      paymentStatus ===
        config.paymentStatuses.PAYMENT_NOT_REQUIRED ||
      enrollment.status === config.statuses.PAID ||
      enrollment.status === config.statuses.PAYMENT_NOT_REQUIRED ||
      enrollment.status === config.statuses.COACH_CONFIRMED ||
      enrollment.status === config.statuses.INTAKE_UNLOCKED ||
      enrollment.status === config.statuses.INTAKE_SUBMITTED ||
      enrollment.status === config.statuses.ACTIVATED ||
      enrollment.status === config.statuses.COMPLETE
    );
  }

  function getAmount(source, keys) {
    for (const key of keys) {
      if (
        Object.prototype.hasOwnProperty.call(source, key) &&
        source[key] !== null &&
        source[key] !== undefined
      ) {
        return source[key];
      }
    }

    return 0;
  }

  function formatMoney(value) {
    const numericValue = Number(value);

    if (!Number.isFinite(numericValue)) {
      return "—";
    }

    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD"
    }).format(numericValue);
  }

  function formatFundingRoute(route) {
    const labels = {
      STANDARD: "Family Paid",
      PARTNER_FUNDED: "Partner Funded",
      SCHOLARSHIP_SPONSORED: "Scholarship or Sponsor"
    };

    return labels[route] || route || "Not provided";
  }

  function setLoading(isLoading) {
    elements.loading.hidden = !isLoading;

    if (isLoading) {
      elements.error.hidden = true;
      elements.app.hidden = true;
    }
  }

  function showFatalError(error) {
    elements.loading.hidden = true;
    elements.app.hidden = true;
    elements.error.hidden = false;
    elements.errorMessage.textContent = getErrorMessage(error);
  }

  function showNotice(message, isError) {
    elements.notice.hidden = false;
    elements.notice.textContent = message;
    elements.notice.classList.toggle(
      "enrollment-notice--error",
      Boolean(isError)
    );
  }

  function clearNotice() {
    elements.notice.hidden = true;
    elements.notice.textContent = "";
    elements.notice.classList.remove(
      "enrollment-notice--error"
    );
  }

  function setButtonBusy(button, isBusy, busyLabel) {
    if (!button) {
      return;
    }

    if (isBusy) {
      button.dataset.originalLabel = button.textContent;
      button.textContent = busyLabel;
      button.disabled = true;
      return;
    }

    button.textContent =
      button.dataset.originalLabel || button.textContent;

    button.disabled = false;
    delete button.dataset.originalLabel;
  }

  function getErrorMessage(error) {
    if (!error) {
      return "An unexpected enrollment error occurred.";
    }

    if (typeof error === "string") {
      return error;
    }

    if (error.message) {
      return error.message;
    }

    return "An unexpected enrollment error occurred.";
  }
})();