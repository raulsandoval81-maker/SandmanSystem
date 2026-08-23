"use strict";

(function () {
  const config = window.SandmanEnrollmentConfig;
  const service = window.SandmanEnrollmentService;

  if (!config) {
    throw new Error("Sandman Enrollment configuration was not loaded.");
  }

  if (!service) {
    throw new Error("Sandman Enrollment service was not loaded.");
  }

  const state = {
    enrollment: null,
    currentStep: "summary",
    intakeTokenId: null
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
    elements.standardsAccepted = document.getElementById(
      "standardsAccepted"
    );
    elements.proposalAccepted = document.getElementById(
      "proposalAccepted"
    );
    elements.signerName = document.getElementById(
      "agreementSignerName"
    );
    elements.signature = document.getElementById(
      "agreementSignature"
    );

    elements.paymentMessage = document.getElementById("paymentMessage");
    elements.paymentStatus = document.getElementById("paymentStatus");
    elements.confirmationMessage = document.getElementById(
      "confirmationMessage"
    );
    elements.confirmationStatus = document.getElementById(
      "confirmationStatus"
    );
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
    elements.openParentIntakeButton = document.getElementById(
      "openParentIntakeButton"
    );
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


    elements.openParentIntakeButton.addEventListener(
      "click",
      handleOpenParentIntake
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
    const agreement = enrollment.agreement || {};

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

    elements.standardsAccepted.checked =
      agreement.standardsAccepted === true;

    elements.proposalAccepted.checked =
      agreement.proposalAccepted === true;

    elements.signerName.value =
      agreement.signerName || "";

    elements.signature.value =
      agreement.signature || "";

    state.intakeTokenId =
      enrollment.intakeTokenId ||
      enrollment.intakeToken ||
      null;


    renderPaymentState();
    renderConfirmationState();
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

  function renderConfirmationState() {
    const enrollment = state.enrollment;
    const status = enrollment.status;

    if (
      status === config.statuses.INTAKE_UNLOCKED ||
      status === config.statuses.INTAKE_SUBMITTED ||
      status === config.statuses.ACTIVATED ||
      status === config.statuses.COMPLETE
    ) {
      elements.confirmationMessage.textContent =
        "Your enrollment is confirmed. Parent Intake is now available.";

      elements.confirmationStatus.textContent =
        "Enrollment confirmed";

      return;
    }

    if (status === config.statuses.COACH_CONFIRMED) {
      elements.confirmationMessage.textContent =
        "Your enrollment has been approved. Parent Intake is being unlocked.";

      elements.confirmationStatus.textContent =
        "Enrollment approved";

      return;
    }

    if (isPaymentComplete(enrollment)) {
      elements.confirmationMessage.textContent =
        "Payment requirements are complete. Final enrollment approval is required before Parent Intake unlocks.";

      elements.confirmationStatus.textContent =
        "Awaiting enrollment approval";

      return;
    }

    elements.confirmationMessage.textContent =
      "Final enrollment approval becomes available after payment is verified or the enrollment is approved as payment not required.";

    elements.confirmationStatus.textContent =
      "Payment requirement incomplete";

  }

  function restoreCorrectStep() {
    const status = state.enrollment.status;

    if (
      status === config.statuses.INTAKE_UNLOCKED ||
      status === config.statuses.INTAKE_SUBMITTED ||
      status === config.statuses.ACTIVATED ||
      status === config.statuses.COMPLETE
    ) {
      showStep("intake");
      return;
    }

    if (
      status === config.statuses.COACH_CONFIRMED ||
      isPaymentComplete(state.enrollment)
    ) {
      showStep("confirmation");
      return;
    }

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
      showStep("agreement");
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

    const signerName = elements.signerName.value.trim();
    const signature = elements.signature.value.trim();

    if (normalizeName(signerName) !== normalizeName(signature)) {
      showNotice(
        "Your digital pledge must match the parent or responsible party name.",
        true
      );

      elements.signature.focus();
      return;
    }

    const agreement = {
      standardsAccepted: elements.standardsAccepted.checked,
      proposalAccepted: elements.proposalAccepted.checked,
      signerName,
      signature
    };

    setButtonBusy(
      elements.agreementForm.querySelector('[type="submit"]'),
      true,
      "Saving Agreement..."
    );

    try {
      const response = await service.saveAgreement(agreement);

      state.enrollment = normalizeEnrollment(response);
      renderEnrollment();
      showStep("payment");
    } catch (error) {
      showNotice(getErrorMessage(error), true);
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

  async function unlockIntake() {
    try {
      const response = await service.createIntakeHandoff();

      state.enrollment = normalizeEnrollment(response);

      state.intakeTokenId =
        response.intakeTokenId ||
        response.intakeToken ||
        state.enrollment.intakeTokenId ||
        state.enrollment.intakeToken ||
        null;

      renderEnrollment();
      showStep("intake");
    } catch (error) {
      showNotice(
        "Your enrollment was approved, but Parent Intake could not be unlocked: " +
          getErrorMessage(error),
        true
      );

      showStep("confirmation");
    }
  }

  function handleOpenParentIntake() {
    if (!state.intakeTokenId) {
      showNotice(
        "Parent Intake is not available yet. Contact the academy team if this continues.",
        true
      );

      return;
    }

    service.openParentIntake(state.intakeTokenId);
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

  function normalizeName(value) {
    return value
      .trim()
      .replace(/\s+/g, " ")
      .toLocaleLowerCase();
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