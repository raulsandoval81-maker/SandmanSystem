import { runtimeEnvironment } from "/assets/js/runtime-environment.js";
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
    elements.intro = document.getElementById("enrollmentIntro");
    elements.paymentStepLabel = document.getElementById("paymentStepLabel");
    elements.paymentStepOwner = document.getElementById("paymentStepOwner");
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
      renderEnrollmentProgress();

      if (
        state.enrollment.paymentRoute === "management_prepaid_reconciliation" &&
        state.enrollment.confirmation?.termsConfirmed === true
      ) {
        if (runtimeEnvironment === "staging" &&
            state.enrollment.pricing?.paymentArrangement === "prepaid_cash_check") {
          const result = normalizeEnrollment(await service.saveConfirmation({termsConfirmed: true}, true));
          if (result.intakePath) {
            window.location.assign(result.intakePath);
            return;
          }
        }
        showPrepaidCompletion();
      }
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

    if (pricing.prepaidTerms && pricing.paymentArrangement !== "monthly_autopay") {
      const t = pricing.prepaidTerms;
      const consent = document.querySelector("label.enrollment-checkbox span");
      if (consent) consent.textContent = "I confirm the membership term, prepaid amount, coverage dates, annual-fee allocation and separately outstanding balance shown above. No automatic renewal is authorized.";
      const continueButton = document.getElementById("saveAgreementButton");
      if (continueButton) continueButton.textContent = pricing.paymentArrangement === "prepaid_cash_check" ? "Confirm & Continue to Intake" : "Confirm & Continue to One-Time Payment";
      elements.dueNowAmount.textContent = formatMoney(pricing.dueNow);
      elements.monthlyAmount.textContent = `No recurring charge — ${t.monthsCovered} months prepaid`;
      elements.annualRenewalAmount.textContent = `Annual fee separately outstanding: ${formatMoney(t.annualEnrollmentFee.outstandingCents / 100)}`;
      elements.fundingRoute.textContent = `${pricing.paymentArrangement === "prepaid_stripe" ? "One-time Stripe payment" : "Existing cash/check; Management reconciliation required"}. Membership ${formatMoney(t.membershipAmountCents / 100)}; fee allocated ${formatMoney(t.annualEnrollmentFee.paidWithPrepaymentCents / 100)}. Coverage ${t.membershipStartDate} through ${t.paidThroughDate}. No automatic renewal; earliest renewal ${t.nextBillingDate}.`;
      elements.termsConfirmed.checked = confirmation.termsConfirmed === true;
      return;
    }
    if (pricing.billingType === "seasonal_one_time") {
      const ledger = Array.isArray(enrollment.seasonalPaymentLedger)
        ? enrollment.seasonalPaymentLedger
        : pricing.installments || [];
      const next = ledger.find((entry) => entry.status !== "paid") || null;
      elements.dueNowAmount.textContent = formatMoney((next?.amountCents || 0) / 100);
      elements.monthlyAmount.textContent = "No recurring charge";
      elements.annualRenewalAmount.textContent = "Season ends February 14, 2027";
      elements.fundingRoute.textContent = "Separate one-time seasonal payments";
      elements.termsConfirmed.checked = confirmation.termsConfirmed === true;
      return;
    }

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

  function enrollmentPathway(enrollment) {
    const pricing = enrollment.pricing || {};
    const cash = enrollment.paymentRoute === "management_prepaid_reconciliation" ||
      pricing.paymentArrangement === "prepaid_cash_check";
    const oneTime = pricing.paymentArrangement === "prepaid_stripe" ||
      pricing.billingType === "seasonal_one_time";
    const confirmed = enrollment.confirmation?.termsConfirmed === true;
    const paid = enrollment.paymentStatus === "PAID";
    return { cash, oneTime, confirmed, paid };
  }

  function renderEnrollmentProgress() {
    const enrollment = state.enrollment;
    if (!enrollment) return;
    const path = enrollmentPathway(enrollment);
    elements.paymentStepLabel.textContent = path.cash
      ? "Cash/Check Verification"
      : path.oneTime ? "One-Time Payment" : "Secure Payment";
    elements.paymentStepOwner.textContent = path.cash ? "Management" : "You";
    elements.intro.textContent = path.cash
      ? "Review your enrollment and confirm the existing Cash/Check arrangement. Management verifies the payment separately; no new online payment is required."
      : "Review your approved enrollment and pricing, confirm the terms, and continue to the required payment step.";
    const stages = document.querySelectorAll(".enrollment-progress [data-step]");
    stages.forEach((element) => {
      element.removeAttribute("aria-current");
      element.removeAttribute("data-status");
    });
    const done = new Set();
    if (path.confirmed) done.add("summary");
    if (path.paid) done.add("payment");
    if (enrollment.intakeComplete) done.add("intake");
    // A completed family confirmation does not prove payment or Intake is complete.
    const current = !path.confirmed ? "summary"
      : path.cash && !enrollment.intakeComplete ? "intake"
      : !path.paid ? "payment"
      : !enrollment.intakeComplete ? "intake"
      : "approval";
    stages.forEach((element) => {
      const stage = element.dataset.step;
      element.dataset.status = done.has(stage) ? "complete" : stage === current ? "current" : "pending";
      if (stage === current) element.setAttribute("aria-current", "step");
    });
    const button = document.getElementById("saveAgreementButton");
    if (button && !path.confirmed) {
      button.textContent = path.cash ? "Confirm & Continue to Intake"
        : path.oneTime ? "Confirm & Continue to One-Time Payment"
        : "Confirm & Continue to Secure Payment";
    }
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
      .querySelectorAll("[data-panel-step]")
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
      state.enrollment.paymentRoute === "management_prepaid_reconciliation"
        ? "Requesting Secure Intake..." : "Opening Secure Payment..."
    );

    try {
      const confirmation = {
        termsConfirmed:
          elements.termsConfirmed.checked
      };

      const confirmResponse =
        await service.saveConfirmation(
          confirmation, runtimeEnvironment === "staging" &&
            state.enrollment.pricing?.paymentArrangement === "prepaid_cash_check"
        );

      state.enrollment =
        normalizeEnrollment(
          confirmResponse
        );
      renderEnrollmentProgress();

      if (
        state.enrollment.paymentRoute ===
        "management_prepaid_reconciliation"
      ) {
        if (state.enrollment.intakePath) {
          window.location.assign(state.enrollment.intakePath);
          return;
        }
        setButtonBusy(submitButton, false);
        showPrepaidCompletion();
        return;
      }

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

  function showPrepaidCompletion() {
    showNotice(
      state.enrollment.intakeComplete ? "Your paperwork is complete. Management will verify payment separately." :
      "Review & Confirm is complete. Management will verify the previously received paid-in-full payment and continue the secure Intake handoff. No online payment is being created.",
      false
    );
    const submitButton = elements.agreementForm?.querySelector('[type="submit"]');
    if (submitButton) {
      submitButton.textContent = state.enrollment.intakeComplete
        ? "Enrollment Paperwork Complete"
        : "Awaiting Secure Intake / Management";
      submitButton.disabled = true;
    }
    elements.termsConfirmed.disabled = true;
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
