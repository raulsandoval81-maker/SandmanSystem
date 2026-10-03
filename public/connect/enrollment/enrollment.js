"use strict";

import {
  SandmanEnrollmentService as service
} from "./enrollment.service.js?v=20261002-6";

import {
  SANDMAN_PRICING_CATALOG
} from "/assets/js/pricing/sandman-pricing-catalog.js";

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
      const message =
        document.createElement("p");

      message.textContent =
        "No athletes were included.";

      elements.athleteList.appendChild(
        message
      );

      return;
    }

    const journeyLabels = {
      zero2hero: "Road2Champion",
      path2legend: "Path2Legend",
      quest2mastery: "Quest2Mastery",
      fitness: "Everyday Fitness",
      "everyday-fitness":
        "Everyday Fitness"
    };

    const disciplineLabels = {
      wrestling: "Wrestling",
      boxing: "Boxing",
      "muay-thai": "Muay Thai",
      mma: "MMA",
      "submission-grappling":
        "Submission Grappling"
    };

    const termLabels = {
      annual: "12-month agreement",
      "six-month": "6-month agreement",
      sixMonth: "6-month agreement",
      "month-to-month":
        "Month-to-month"
    };

    const accessLevels =
      SANDMAN_PRICING_CATALOG
        ?.combat
        ?.accessLevels || {};

    const list =
      document.createElement("div");

    list.className =
      "enrollment-athlete-plans";

    athletes.forEach(function (athlete) {
      const card =
        document.createElement("article");

      card.className =
        "enrollment-athlete-plan";

      const name =
        athlete.name ||
        athlete.athleteName ||
        "Athlete";

      const journey =
        journeyLabels[
          athlete.journey
        ] ||
        athlete.journey ||
        "—";

      const disciplines =
        Array.isArray(
          athlete.disciplines
        )
          ? athlete.disciplines
              .map(
                (discipline) =>
                  disciplineLabels[
                    discipline
                  ] ||
                  discipline
              )
              .join(" + ")
          : (
              disciplineLabels[
                athlete.discipline
              ] ||
              athlete.discipline ||
              "—"
            );

      const access =
        accessLevels[
          athlete.trainingAccess
        ];

      const planName =
        access?.label ||
        athlete.trainingAccess ||
        "Training plan";

      const planDescription =
        access?.description ||
        "";

      const term =
        termLabels[
          athlete.billingTerm
        ] ||
        athlete.billingTerm ||
        "—";

      const heading =
        document.createElement("h4");

      heading.textContent =
        name;

      const plan =
        document.createElement("strong");

      plan.className =
        "enrollment-athlete-plan__name";

      plan.textContent =
        planName;

      const details =
        document.createElement("dl");

      details.innerHTML = `
        <div>
          <dt>Journey</dt>
          <dd>${escapeHtml(journey)}</dd>
        </div>
        <div>
          <dt>Discipline</dt>
          <dd>${escapeHtml(disciplines)}</dd>
        </div>
        <div>
          <dt>Agreement</dt>
          <dd>${escapeHtml(term)}</dd>
        </div>
      `;

      card.appendChild(heading);
      card.appendChild(plan);

      if (planDescription) {
        const description =
          document.createElement("p");

        description.className =
          "enrollment-athlete-plan__description";

        description.textContent =
          planDescription;

        card.appendChild(
          description
        );
      }

      card.appendChild(details);
      list.appendChild(card);
    });

    elements.athleteList.appendChild(list);
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
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