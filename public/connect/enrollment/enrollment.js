"use strict";

import {
  SandmanEnrollmentService as service
} from "./enrollment.service.js?v=20261002-5";

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

  }

  function bindEvents() {
    elements.agreementForm.addEventListener(
      "submit",
      handleAgreementSubmit
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

  function restoreCorrectStep() {
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

    const submitButton =
      elements.agreementForm.querySelector(
        '[type="submit"]'
      );

    setButtonBusy(
      submitButton,
      true,
      "Opening Secure Payment..."
    );

    try {
      const confirmation = {
        termsConfirmed:
          elements.termsConfirmed.checked
      };

      const confirmResponse =
        await service.saveConfirmation(
          confirmation
        );

      state.enrollment =
        normalizeEnrollment(
          confirmResponse
        );

      const checkoutResponse =
        await service.createCheckout();

      const checkoutUrl =
        checkoutResponse.checkoutUrl ||
        checkoutResponse.url;

      if (!checkoutUrl) {
        throw new Error(
          "The backend did not return a Stripe Checkout URL."
        );
      }

      window.location.assign(
        checkoutUrl
      );
    } catch (error) {
      showNotice(
        getErrorMessage(error),
        true
      );

      setButtonBusy(
        submitButton,
        false
      );
    }
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