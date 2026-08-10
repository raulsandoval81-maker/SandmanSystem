import {
  auth,
  db,
  functions,
  httpsCallable,
  doc,
  getDoc
} from "/assets/js/firebase-init.js";

import {
  SANDMAN_PRICING_CATALOG
} from "/assets/js/pricing/sandman-pricing-catalog.js";

console.log("Prospect Builder Firebase ready:", Boolean(db));
// --------------------------------------------------
// Admissions Request (Phase 1)
// --------------------------------------------------

const params =
  new URLSearchParams(window.location.search);

const requestId =
  params.get("requestId") || "";

const appointmentId =
  params.get("appointmentId") || "";

let proposalId =
  params.get("proposalId") || "";
  
const backToProposalBtn =
  document.getElementById(
    "backToProposalBtn"
  );

console.log(
  "Admissions Request:",
  requestId
);

console.log(
  "Admissions Appointment:",
  appointmentId
);

if (
  backToProposalBtn &&
  appointmentId
) {
  backToProposalBtn.href =
    "/connect/proposals/" +
    `?appointmentId=${encodeURIComponent(
      appointmentId
    )}`;

  backToProposalBtn.textContent =
    "← Back to Proposal";
}


function buildLoginUrl() {
  const returnTo =
    window.location.pathname +
    window.location.search;


    return (
  "/management/auth/?returnUrl=" +
  encodeURIComponent(returnTo)
);
}

async function waitForAuthState() {
  if (
    typeof auth.authStateReady === "function"
  ) {
    await auth.authStateReady();
  }

  for (
    let attempt = 0;
    attempt < 12;
    attempt += 1
  ) {
    if (auth.currentUser) {
      return auth.currentUser;
    }

    await new Promise((resolve) => {
      setTimeout(resolve, 100);
    });
  }

  return auth.currentUser || null;
}

async function requireStaffSession() {
  const user =
    await waitForAuthState();

  if (!user) {
    window.location.href =
      buildLoginUrl();

    return false;
  }

  await user.getIdTokenResult(true);

  return true;
}
async function loadAdmissionsRequest() {
  const hasStaffSession =
    await requireStaffSession();

  if (!hasStaffSession) {
    return;
  }

  if (!requestId) {
    console.log(
      "No admissions request ID supplied."
    );

    return;
  }

  const snapshot =
    await getDoc(
      doc(
        db,
        "admissions_requests",
        requestId
      )
    );

  if (!snapshot.exists()) {
    console.log(
      "Admissions request not found:",
      requestId
    );

    return;
  }

  console.log(
    "Admissions request loaded:",
    {
      id: snapshot.id,
      ...snapshot.data()
    }
  );
}

loadAdmissionsRequest().catch((error) => {
  console.error(
    "Unable to load admissions request:",
    error
  );
});

async function loadAdmissionsAppointment() {
  if (!appointmentId) {
    return null;
  }

  const hasStaffSession =
    await requireStaffSession();

  if (!hasStaffSession) {
    return null;
  }

  const snapshot =
    await getDoc(
      doc(
        db,
        "admissions_appointments",
        appointmentId
      )
    );

  if (!snapshot.exists()) {
    throw new Error(
      `Admissions appointment ${appointmentId} was not found.`
    );
  }

  const appointment = {
    id: snapshot.id,
    ...snapshot.data()
  };

  console.log(
    "Admissions appointment loaded:",
    appointment
  );

  return appointment;
}

function recommendationFromProgram(
  programInterest = ""
) {
  const map = {
    "zero2hero-wrestling": {
      journey: "zero2hero",
      discipline: "wrestling"
    },

    "zero2hero-boxing": {
      journey: "zero2hero",
      discipline: "boxing"
    },

    "zero2hero-muay-thai": {
      journey: "zero2hero",
      discipline: "muay-thai"
    },

    "path2legend-wrestling": {
      journey: "path2legend",
      discipline: "wrestling"
    },

    "path2legend-boxing": {
      journey: "path2legend",
      discipline: "boxing"
    },

    "path2legend-muay-thai": {
      journey: "path2legend",
      discipline: "muay-thai"
    },

    "quest2mastery-mma": {
      journey: "quest2mastery",
      discipline: "mma"
    },

    "quest2mastery-submission-grappling": {
      journey: "quest2mastery",
      discipline: "submission-grappling"
    },

    fitness: {
      journey: "everyday-fitness",
      discipline: ""
    }
  };

  return map[programInterest] || {
    journey: "",
    discipline: ""
  };
}

// --------------------------------------------------
// Calculator
// --------------------------------------------------

const PRICING =
  SANDMAN_PRICING_CATALOG;

const FOUNDING_YEAR = {
  combatMonthly:
    PRICING.combat.standardFamily.athlete1,

  fitnessMonthly:
    PRICING.fitness.monthly,

  comboMonthToMonth:
    PRICING.combo.monthToMonth,

  comboAnnualAutopay:
    PRICING.combo.annualAutopay,

  athleteOnboarding:
    PRICING.fees.athleteOnboarding,

  athleteAnnualRenewal:
    PRICING.fees.athleteAnnualRenewal,

  defaultAdmissionsCredit:
    PRICING.credits.admissionsDefault
};

const familyMonthly = {
  1:
    PRICING.combat.standardFamily.athlete1,

  2:
    PRICING.combat.standardFamily.athlete2Total,

  3:
    PRICING.combat.standardFamily.athlete3Total,

  4:
    PRICING.combat.standardFamily.athlete4Total
};

const extras = {
  "none": { label:"No optional service", amount:0, promoEligible:false },
  "fitness-dropin": { label:"Fitness drop-in", amount:15, promoEligible:false },
  "private-30": { label:"Private lesson — 30 minutes", amount:25, promoEligible:false },
  "private-60": { label:"Private lesson — 60 minutes", amount:50, promoEligible:true },
  "private-90": { label:"Private lesson — 90 minutes", amount:70, promoEligible:true },
  "semi-private": { label:"Semi-private lesson — 90 minutes", amount:60, promoEligible:false }
};

    const el = {
      familyName:document.getElementById("familyName"),
      coachName:document.getElementById("coachName"),
      coachRecommendation:document.getElementById("coachRecommendation"),
      addAthlete:document.getElementById("addAthlete"),
      athleteList:document.getElementById("athleteList"),
      athleteTemplate:document.getElementById("athleteTemplate"),
      extra:document.getElementById("extra"),
      support:document.getElementById("support"),
      privatePromo:document.getElementById("privatePromo"),
      fitnessCredit:document.getElementById("fitnessCredit"),
      monthlySponsor:document.getElementById("monthlySponsor"),
      annualSponsor:document.getElementById("annualSponsor"),
      dueNow:document.getElementById("dueNow"),
      monthlyTotal:document.getElementById("monthlyTotal"),
      firstYearTotal:document.getElementById("firstYearTotal"),
      annualTotal:document.getElementById("annualTotal"),
      breakdown:document.getElementById("breakdown"),
      summary:document.getElementById("summary"),
      familyPrintProposal:
        document.getElementById("familyPrintProposal"),

      printFamilyName:
        document.getElementById("printFamilyName"),

      printCoachName:
        document.getElementById("printCoachName"),

      printAthleteSummary:
        document.getElementById("printAthleteSummary"),

      printDueNow:
        document.getElementById("printDueNow"),

      printMonthly:
        document.getElementById("printMonthly"),

      printSavingsCard:
        document.getElementById("printSavingsCard"),

      printSavings:
        document.getElementById("printSavings"),

      printSavingsNote:
        document.getElementById("printSavingsNote"),

      printAnnualRenewal:
        document.getElementById("printAnnualRenewal"),

      printMembershipDetailContent:
        document.getElementById(
          "printMembershipDetailContent"
        ),

      printRecommendationSection:
        document.getElementById(
          "printRecommendationSection"
        ),

      printRecommendation:
        document.getElementById("printRecommendation"),

      standardCompare:document.getElementById("standardCompare"),
      unlimitedCompare:document.getElementById("unlimitedCompare"),
      printButton:document.getElementById("printButton"),
      saveDraftButton:document.getElementById("saveDraftButton"),
      submitReviewButton:document.getElementById("submitReviewButton"),
      approveProposalButton:document.getElementById("approveProposalButton"),
      checkoutProposalButton:document.getElementById("checkoutProposalButton"),
      resetButton:document.getElementById("resetButton"),

      proposalWorkflow:
        document.getElementById("proposalWorkflow"),

      proposalWorkflowStage:
        document.getElementById("proposalWorkflowStage"),

      proposalWorkflowId:
        document.getElementById("proposalWorkflowId"),

      proposalWorkflowSteps:
        document.getElementById("proposalWorkflowSteps"),

      proposalWorkflowNext:
        document.getElementById("proposalWorkflowNext"),

      proposalWorkflowRoute:
        document.getElementById("proposalWorkflowRoute"),

      proposalWorkflowRouteLink:
        document.getElementById("proposalWorkflowRouteLink")
    };

    function money(value){
      return "$" + Math.max(0,Math.round(Number(value)||0)).toLocaleString();
    }

    function line(label,amount,{credit=false,total=false}={}){
      const row=document.createElement("div");
      row.className=["line",credit?"credit":"",total?"total":""].filter(Boolean).join(" ");

      const a=document.createElement("span");
      const b=document.createElement("span");

      a.textContent=label;
      b.textContent=(credit?"-":"")+money(Math.abs(amount));

      row.append(a,b);
      return row;
    }

    function addAthlete(defaults={}){
      const fragment=el.athleteTemplate.content.cloneNode(true);
      const card=fragment.querySelector(".athlete-card");

      el.athleteList.appendChild(fragment);

      const cards=[...el.athleteList.querySelectorAll(".athlete-card")];
      const newCard=cards[cards.length-1];

      newCard.querySelector(".athlete-name").value=defaults.name||"";
      newCard.querySelector(".journey").value=defaults.journey||"zero2hero";
      newCard.querySelector(".athlete-plan").value=defaults.plan||"standard";
      newCard.querySelector(".billing-term").value=defaults.billingTerm||"month-to-month";
      newCard.querySelector(
        ".admissions-credit"
      ).value =
        defaults.credit ??
        String(
          FOUNDING_YEAR.defaultAdmissionsCredit
        );
      newCard.querySelector(".renewal-behavior").value=defaults.renewalBehavior||"month-to-month";

      if(defaults.disciplines){
        defaults.disciplines.forEach(value=>{
          const box=newCard.querySelector(`.discipline[value="${value}"]`);
          if(box) box.checked=true;
        });
      }

      newCard.querySelector(".remove-athlete").addEventListener("click",()=>{
        if(el.athleteList.querySelectorAll(".athlete-card").length===1) return;
        newCard.remove();
        refreshAthleteTitles();
        calculate();
      });

      newCard.querySelectorAll("input,select").forEach(control=>{
        control.addEventListener("input",calculate);
        control.addEventListener("change",calculate);
      });

      refreshAthleteTitles();
      calculate();
    }

    function refreshAthleteTitles(){
      [...el.athleteList.querySelectorAll(".athlete-card")].forEach((card,index)=>{
        card.querySelector(".athlete-title").textContent=`Athlete ${index+1}`;
      });
    }

    function readAthletes(){
      return [...el.athleteList.querySelectorAll(".athlete-card")].map((card,index)=>{
        const disciplines=[...card.querySelectorAll(".discipline:checked")].map(x=>x.value);

        return{
          index:index+1,
          name:card.querySelector(".athlete-name").value.trim()||`Athlete ${index+1}`,
          journey:card.querySelector(".journey").value,
          plan:card.querySelector(".athlete-plan").value,
          billingTerm:card.querySelector(".billing-term").value,
          renewalBehavior:card.querySelector(".renewal-behavior").value,
          credit:Number(card.querySelector(".admissions-credit").value||0),
          disciplines
        };
      });
    }

    function calculate(){
      const athletes=readAthletes();
      const extra=extras[el.extra.value];
      const support=Math.max(0,Number(el.support.value)||0);
      const monthlySponsor=Math.max(0,Number(el.monthlySponsor.value)||0);
      const annualSponsor=Math.max(0,Number(el.annualSponsor.value)||0);

      let registrationCount=0;
      let admissionsCredits=0;
      let fitnessCount=0;
      let comboCount=0;
      let standardCount=0;

      athletes.forEach((a) => {
        if (a.plan === "fitness") {
          fitnessCount += 1;
          return;
        }

        /*
         * Onboarding and annual renewal are now
         * per Combat athlete, not per discipline.
         */
        registrationCount += 1;

        admissionsCredits += a.credit;

        if (a.plan === "combo") {
          comboCount += 1;
        }

        if (a.plan === "standard") {
          standardCount += 1;
        }
      });

      const enrollmentBase =
        registrationCount *
        FOUNDING_YEAR.athleteOnboarding;

      const annualBase =
        registrationCount *
        FOUNDING_YEAR.athleteAnnualRenewal;

      let monthlyBase = 0;

      if (standardCount > 0) {
        if (standardCount <= 4) {
          monthlyBase +=
            familyMonthly[standardCount];
        } else {
          monthlyBase +=
            familyMonthly[4] +
            (
              standardCount - 4
            ) *
            PRICING.combat.standardFamily
              .additionalAthlete;
        }
      }

      monthlyBase +=
        fitnessCount *
        FOUNDING_YEAR.fitnessMonthly;

      /*
       * Combat + Fitness is currently priced
       * per participant.
       *
       * Multi-athlete Combo family pricing
       * has NOT been separately defined yet.
       */
      athletes
        .filter(
          (athlete) =>
            athlete.plan === "combo"
        )
        .forEach((athlete) => {
          monthlyBase +=
            athlete.billingTerm === "annual"
              ? FOUNDING_YEAR.comboAnnualAutopay
              : FOUNDING_YEAR.comboMonthToMonth;
        });

      /*
       * Founding Year core memberships are
       * not discounted simply for signing
       * an agreement.
       *
       * The Combo agreement benefit is
       * already represented directly in
       * monthlyBase as $140 -> $120.
       */
      let commitmentDiscount = 0;

      const comboAgreementCount =
        athletes.filter(
          (athlete) =>
            athlete.plan === "combo" &&
            athlete.billingTerm === "annual"
        ).length;

      const agreementSavingsAnnual =
        comboAgreementCount *
        (
          FOUNDING_YEAR.comboMonthToMonth -
          FOUNDING_YEAR.comboAnnualAutopay
        ) *
        12;

      let privatePromo=0;
      if(el.privatePromo.checked&&extra.promoEligible){
        privatePromo=10;
      }

      let fitnessCredit = 0;

      const hasFitnessMembership =
        fitnessCount > 0 ||
        comboCount > 0;

      if (
        el.fitnessCredit.checked &&
        hasFitnessMembership
      ) {
        fitnessCredit = 15;
      }

      const dueNow=Math.max(
        0,
        enrollmentBase+
        extra.amount-
        admissionsCredits-
        privatePromo-
        fitnessCredit-
        support
      );

      const monthlyBalance=Math.max(
        0,
        monthlyBase-commitmentDiscount-monthlySponsor
      );

      const annualRenewal=Math.max(0,annualBase-annualSponsor);
      const firstYear=Math.max(
        0,
        dueNow+
        monthlyBalance*12+
        annualRenewal
      );

      el.dueNow.textContent=money(dueNow);
      el.monthlyTotal.textContent=money(monthlyBalance);
      el.firstYearTotal.textContent=money(firstYear);
      el.annualTotal.textContent=money(annualRenewal);

      el.standardCompare.textContent =
        `${money(
          FOUNDING_YEAR.combatMonthly
        )} Combat`;

      el.unlimitedCompare.textContent =
        `${money(
          FOUNDING_YEAR.comboMonthToMonth
        )} / ${money(
          FOUNDING_YEAR.comboAnnualAutopay
        )} Combo`;

      el.breakdown.innerHTML="";

      athletes.forEach((a) => {
        if (a.plan === "fitness") {
          el.breakdown.append(
            line(
              `${a.name} — Everyday Fitness`,
              FOUNDING_YEAR.fitnessMonthly
            )
          );

          return;
        }

        el.breakdown.append(
          line(
            `${a.name} — Athlete onboarding`,
            FOUNDING_YEAR.athleteOnboarding
          )
        );

        if (a.disciplines.length === 0) {
          el.breakdown.append(
            line(
              `${a.name} — No Combat discipline selected`,
              0
            )
          );
        }
      });

      if(extra.amount>0){
        el.breakdown.append(line(extra.label,extra.amount));
      }

      if(admissionsCredits>0){
        el.breakdown.append(line("Admissions credits",admissionsCredits,{credit:true}));
      }

      if(privatePromo>0){
        el.breakdown.append(line("Private-session promotion",privatePromo,{credit:true}));
      }

      if(fitnessCredit>0){
        el.breakdown.append(line("Fitness drop-in credit",fitnessCredit,{credit:true}));
      }

      if(support>0){
        el.breakdown.append(line("Approved enrollment support",support,{credit:true}));
      }

      el.breakdown.append(line("Due at enrollment",dueNow,{total:true}));

      const d1=document.createElement("div");
      d1.className="divider";
      el.breakdown.append(d1);

      el.breakdown.append(line("Base monthly membership",monthlyBase));

      if(commitmentDiscount>0){
        el.breakdown.append(
          line(
            "12-month agreement adjustment",
            commitmentDiscount,
            {credit:true}
          )
        );
      }

      if(monthlySponsor>0){
        el.breakdown.append(line("Monthly sponsor support",monthlySponsor,{credit:true}));
      }

      el.breakdown.append(line("Monthly family balance",monthlyBalance,{total:true}));

      const d2=document.createElement("div");
      d2.className="divider";
      el.breakdown.append(d2);

      el.breakdown.append(
        line(
          "Annual athlete renewal",
          annualBase
        )
      );

      if(annualSponsor>0){
        el.breakdown.append(line("Annual sponsor support",annualSponsor,{credit:true}));
      }

      el.breakdown.append(line("Annual renewal estimate",annualRenewal,{total:true}));

      const familyName=el.familyName.value.trim();
      const intro=familyName?`<p><strong>${familyName}</strong></p>`:"";

      const athleteText=athletes.map(a=>{
        const planLabel = {
          standard:
            "Combat",

          fitness:
            "Everyday Fitness",

          combo:
            "Combat + Fitness"
        }[a.plan];

        const disciplineText =
          a.plan === "fitness"
            ? "fitness"
            : a.plan === "combo"
              ? (
                a.disciplines.length
                  ? `${a.disciplines.join(", ")} + fitness`
                  : "combat + fitness"
              )
              : a.disciplines.length
                ? a.disciplines.join(", ")
                : "no discipline selected";

        const termLabel =
          a.billingTerm==="annual"
            ? "12-month agreement"
            : "month-to-month";

        return `${a.name}: ${planLabel} — ${disciplineText} — ${termLabel}`;
      }).join("<br>");

      const recommendation=el.coachRecommendation.value.trim();

      const familySavings =
        agreementSavingsAnnual > 0
          ? `
            <p class="family-savings">
              <strong>You save:</strong>
              ${money(
                agreementSavingsAnnual / 12
              )} per month /
              <strong>${money(
                agreementSavingsAnnual
              )} over 12 months</strong>.
            </p>
          `
          : "";

      el.summary.innerHTML=`
        ${intro}
        <p>${athleteText}</p>

        <p>
          Due at enrollment:
          <strong>${money(dueNow)}</strong>.
          Monthly membership:
          <strong>${money(monthlyBalance)}/month</strong>.
          Annual athlete renewal:
          <strong>${money(annualRenewal)}/year</strong>.
        </p>

        ${familySavings}

        ${
          recommendation
            ? `<p><strong>Coach recommendation:</strong> ${recommendation}</p>`
            : ""
        }
      `;

      return {
        athletes,

        pricing: {
          registrationCount,
          enrollmentBase,
          extraCode: el.extra.value,
          extraLabel: extra.label,
          extraAmount: extra.amount,
          admissionsCredits,
          privatePromo,
          fitnessCredit,
          support,
          dueNow,
          monthlyBase,
          commitmentDiscount,
          agreementSavingsAnnual,

          monthlySponsor,
          monthlyBalance,

          annualBase,
          annualSponsor,
          annualRenewal,

          firstYear,

          catalog:
            PRICING.version,

          catalogEffectiveFrom:
            PRICING.effectiveFrom,

          combatFamilyLadder: {
            athlete1: 80,
            athlete2Total: 120,
            athlete3Total: 140,
            athlete4Total: 160,
            additionalAthlete: 20
          },

          fitnessMonthly:
            FOUNDING_YEAR.fitnessMonthly,

          comboMonthToMonth:
            FOUNDING_YEAR.comboMonthToMonth,

          comboAnnualAutopay:
            FOUNDING_YEAR.comboAnnualAutopay,

          athleteOnboarding:
            FOUNDING_YEAR.athleteOnboarding,

          athleteAnnualRenewal:
            FOUNDING_YEAR.athleteAnnualRenewal
        },

        agreement: {
          athleteTerms: athletes.map((athlete) => ({
            index: athlete.index,
            name: athlete.name,
            billingTerm: athlete.billingTerm,
            renewalBehavior: athlete.renewalBehavior
          }))
        },

        internalNotes:
          el.coachRecommendation.value.trim() || null
      };
    }

    async function saveProposalDraft(){
      if (
        !proposalId &&
        !appointmentId &&
        !requestId
      ) {
        alert(
          "This Builder must be opened from an appointment or admissions request before saving."
        );
        return;
      }

      const user =
        await requireStaffSession();

      if (!user) {
        return;
      }

      const snapshot =
        calculate();

      const originalText =
        el.saveDraftButton.textContent;

      el.saveDraftButton.disabled = true;
      el.saveDraftButton.textContent =
        "Saving…";

      try {
const isExistingProposal =
  Boolean(proposalId);

const functionName =
  isExistingProposal
    ? "updateProposalDraft"
    : "createProposalDraft";

        const saveDraft =
          httpsCallable(
            functions,
            functionName
          );

        const response =
          await saveDraft({
            proposalId:
              proposalId || null,

            appointmentId:
              appointmentId || null,

            admissionsRequestId:
              requestId || null,

            prospect: {
              appointmentId:
                appointmentId || null,

              admissionsRequestId:
                requestId || null,

              familyName:
                el.familyName.value.trim() ||
                null
            },

            coach: {
              name:
                el.coachName.value.trim() ||
                null
            },

            athletes:
              snapshot.athletes,

            pricing:
              snapshot.pricing,

            agreement:
              snapshot.agreement,

            internalNotes:
              snapshot.internalNotes
          });

        const savedProposalId =
          response.data?.proposalId;

        if (!savedProposalId) {
          throw new Error(
            "Proposal ID was not returned."
          );
        }

        // The first save creates the proposal ID.
// Keep that ID in the active Builder session so
// subsequent saves update the same proposal and
// Submit for Review can advance it to REVIEW.
proposalId = savedProposalId;

// Preserve the proposal in the URL without
// reloading the Prospect Builder.
const proposalUrl =
  new URL(window.location.href);

proposalUrl.searchParams.set(
  "proposalId",
  savedProposalId
);

window.history.replaceState(
  {},
  "",
  proposalUrl
);

        el.saveDraftButton.disabled = false;
        el.saveDraftButton.textContent =
          `Saved ${savedProposalId}`;

alert(
  isExistingProposal
    ? `Proposal draft ${savedProposalId} updated successfully.`
    : `Proposal draft ${savedProposalId} created successfully.`
);
        } catch (error) {
        console.error(
          "Save proposal draft failed:",
          error
        );

        el.saveDraftButton.disabled = false;
        el.saveDraftButton.textContent =
          originalText;

        alert(
          error?.message ||
          "Unable to save the proposal draft."
        );
      }
    }

    async function submitForReview() {
      if (!proposalId) {
        alert(
          "Save the proposal draft before submitting it for review."
        );
        return;
      }

      const confirmed =
        window.confirm(
          `Submit ${proposalId} for review? ` +
          "The draft will no longer be editable."
        );

      if (!confirmed) {
        return;
      }

      const user =
        await requireStaffSession();

      if (!user) {
        return;
      }

      const originalText =
        el.submitReviewButton.textContent;

      el.submitReviewButton.disabled = true;
      el.submitReviewButton.textContent =
        "Submitting…";

      try {
        const submitReview =
          httpsCallable(
            functions,
            "submitProposalForReview"
          );

        const response =
          await submitReview({
            proposalId,

            coachName:
              el.coachName.value.trim() ||
              null
          });

        if (
          response.data?.status !== "REVIEW"
        ) {
          throw new Error(
            "REVIEW status was not returned."
          );
        }

        el.saveDraftButton.disabled = true;
        el.saveDraftButton.textContent =
          `${proposalId} — REVIEW`;

        el.submitReviewButton.disabled = true;
        el.submitReviewButton.textContent =
          "Submitted for Review";

        renderProposalWorkflow(
          "REVIEW"
        );

        alert(
          `Proposal ${proposalId} submitted for review successfully.`
        );
      } catch (error) {
        console.error(
          "Submit proposal for review failed:",
          error
        );

        el.submitReviewButton.disabled = false;
        el.submitReviewButton.textContent =
          originalText;

        alert(
          error?.message ||
          "Unable to submit the proposal for review."
        );
      }
    }

async function approveCurrentProposal() {
  if (!proposalId) {
    alert("No proposal ID was supplied.");
    return;
  }

  const confirmed =
    window.confirm(
      `Approve ${proposalId} and prepare it for checkout?`
    );

  if (!confirmed) {
    return;
  }

  const user =
    await requireStaffSession();

  if (!user) {
    return;
  }

  const originalText =
    el.approveProposalButton.textContent;

  el.approveProposalButton.disabled = true;
  el.approveProposalButton.textContent =
    "Approving…";

  try {
    const approve =
      httpsCallable(
        functions,
        "approveProposal"
      );

    const response =
      await approve({
        proposalId,

        coachName:
          el.coachName.value.trim() ||
          null
      });

    if (
      response.data?.status !==
      "READY_FOR_CHECKOUT"
    ) {
      throw new Error(
        "READY_FOR_CHECKOUT status was not returned."
      );
    }

    el.saveDraftButton.textContent =
      `${proposalId} — READY_FOR_CHECKOUT`;

    el.submitReviewButton.textContent =
      "Submitted for Review";

    el.approveProposalButton.hidden = true;
    el.approveProposalButton.disabled = true;
    el.approveProposalButton.textContent =
      "Proposal Approved";

    el.checkoutProposalButton.hidden = false;
    el.checkoutProposalButton.disabled = false;
    el.checkoutProposalButton.textContent =
      "Begin Checkout";

    renderProposalWorkflow(
      "READY_FOR_CHECKOUT"
    );

    alert(
      `Proposal ${proposalId} approved and ready for checkout.`
    );
  } catch (error) {
    console.error(
      "Approve proposal failed:",
      error
    );

    el.approveProposalButton.disabled = false;
    el.approveProposalButton.textContent =
      originalText;

    alert(
      error?.message ||
      "Unable to approve the proposal."
    );
  }
}

async function beginProposalCheckout() {
  if (!proposalId) {
    alert("No proposal ID was supplied.");
    return;
  }

      const confirmed =
        window.confirm(
          `Begin Stripe checkout for ${proposalId}?`
        );

      if (!confirmed) {
        return;
      }

      const user =
        await requireStaffSession();

      if (!user) {
        return;
      }

      const originalText =
        el.checkoutProposalButton.textContent;

      el.checkoutProposalButton.disabled = true;
      el.checkoutProposalButton.textContent =
        "Opening Checkout…";

      try {
        const createCheckout =
          httpsCallable(
            functions,
            "createProposalCheckout"
          );

        const response =
          await createCheckout({
            proposalId
          });

        const checkoutUrl =
          response.data?.checkoutUrl;

        if (!checkoutUrl) {
          throw new Error(
            "Stripe checkout URL was not returned."
          );
        }

        window.location.assign(checkoutUrl);
      } catch (error) {
        console.error(
          "Proposal checkout failed:",
          error
        );

        el.checkoutProposalButton.disabled = false;
        el.checkoutProposalButton.textContent =
          originalText;

        alert(
          error?.message ||
          "Unable to begin Stripe checkout."
        );
      }
    }


    function renderProposalWorkflow(
      status = "BUILDING"
    ) {
      const normalized =
        String(status || "BUILDING")
          .toUpperCase();

      const steps = [
        "Admissions Decision",
        "Proposal Draft",
        "Review",
        "Approval",
        "Checkout",
        "Enrollment"
      ];

      const stageIndex = {
        BUILDING: 1,
        DRAFT: 1,
        REVIEW: 2,
        READY_FOR_CHECKOUT: 4,
        CHECKOUT_CREATED: 4,
        PAYMENT_PENDING: 4,
        PAID: 5,
        LOCKED: 5
      }[normalized] ?? 1;

      const stageLabels = {
        BUILDING: "Building Proposal",
        DRAFT: "Proposal Draft",
        REVIEW: "Needs Review",
        READY_FOR_CHECKOUT: "Checkout Ready",
        CHECKOUT_CREATED: "Checkout Created",
        PAYMENT_PENDING: "Payment Pending",
        PAID: "Payment Complete",
        LOCKED: "Locked"
      };

      const nextText = {
        BUILDING:
          "Save the proposal when the family configuration is ready.",

        DRAFT:
          "Review the family configuration, then submit this proposal for review.",

        REVIEW:
          "Review the proposal and approve it when the family offer is ready.",

        READY_FOR_CHECKOUT:
          "Begin checkout for this approved proposal.",

        CHECKOUT_CREATED:
          "Checkout has been created. Complete the payment step.",

        PAYMENT_PENDING:
          "Payment is pending. No additional proposal action is needed yet.",

        PAID:
          "Payment is complete. Continue to Enrollment.",

        LOCKED:
          "This proposal is locked and no longer editable."
      };

      if (el.proposalWorkflowStage) {
        el.proposalWorkflowStage.textContent =
          stageLabels[normalized] ||
          normalized;
      }

      if (el.proposalWorkflowId) {
        el.proposalWorkflowId.textContent =
          proposalId || "";
      }

      if (el.proposalWorkflowNext) {
        el.proposalWorkflowNext.textContent =
          nextText[normalized] ||
          "Continue with the next proposal step.";
      }

      if (el.proposalWorkflowSteps) {
        el.proposalWorkflowSteps.innerHTML =
          steps
            .map((step, index) => {
              const complete =
                index < stageIndex;

              const current =
                index === stageIndex;

              const symbol =
                complete
                  ? "✓"
                  : current
                    ? "→"
                    : "○";

              const className =
                current
                  ? "is-current"
                  : complete
                    ? "is-complete"
                    : "";

              return `
                <span class="${className}">
                  ${symbol} ${step}
                </span>
              `;
            })
            .join("");
      }

      const showQueueRoute =
        normalized === "REVIEW" ||
        normalized === "READY_FOR_CHECKOUT" ||
        normalized === "CHECKOUT_CREATED" ||
        normalized === "PAYMENT_PENDING" ||
        normalized === "PAID" ||
        normalized === "LOCKED";

      if (el.proposalWorkflowRoute) {
        el.proposalWorkflowRoute.hidden =
          !showQueueRoute;
      }

      if (el.proposalWorkflowRouteLink) {
        el.proposalWorkflowRouteLink.href =
          "/connect/proposals/";
      }

      if (normalized === "BUILDING") {
        el.saveDraftButton.hidden = false;
        el.submitReviewButton.hidden = false;
        el.approveProposalButton.hidden = true;
        el.checkoutProposalButton.hidden = true;
        el.resetButton.hidden = false;
      }

      if (normalized === "DRAFT") {
        el.saveDraftButton.hidden = false;
        el.submitReviewButton.hidden = false;
        el.approveProposalButton.hidden = true;
        el.checkoutProposalButton.hidden = true;
        el.resetButton.hidden = false;
      }

      if (normalized === "REVIEW") {
        el.saveDraftButton.hidden = true;
        el.submitReviewButton.hidden = true;
        el.approveProposalButton.hidden = false;
        el.checkoutProposalButton.hidden = true;
        el.resetButton.hidden = true;
      }

      if (normalized === "READY_FOR_CHECKOUT") {
        el.saveDraftButton.hidden = true;
        el.submitReviewButton.hidden = true;
        el.approveProposalButton.hidden = true;
        el.checkoutProposalButton.hidden = false;
        el.resetButton.hidden = true;
      }

      if (
        normalized === "CHECKOUT_CREATED" ||
        normalized === "PAYMENT_PENDING" ||
        normalized === "PAID" ||
        normalized === "LOCKED"
      ) {
        el.saveDraftButton.hidden = true;
        el.submitReviewButton.hidden = true;
        el.approveProposalButton.hidden = true;
        el.checkoutProposalButton.hidden = true;
        el.resetButton.hidden = true;
      }
    }

    async function loadProposalDraft(){
      if (!proposalId) {
        return false;
      }

      const hasStaffSession =
        await requireStaffSession();

      if (!hasStaffSession) {
        return false;
      }

      const snapshot =
        await getDoc(
          doc(
            db,
            "proposals",
            proposalId
          )
        );

      if (!snapshot.exists()) {
        throw new Error(
          `Proposal ${proposalId} was not found.`
        );
      }

      const proposal =
        snapshot.data() || {};

      const prospect =
        proposal.prospect || {};

      const coach =
        proposal.coach || {};

      const pricing =
        proposal.pricing || {};

      const athletes =
        Array.isArray(proposal.athletes)
          ? proposal.athletes
          : [];

      el.familyName.value =
        prospect.familyName || "";

      el.coachName.value =
        coach.name || "Coach Sandoval";

      el.coachRecommendation.value =
        proposal.internalNotes || "";

      el.extra.value =
        extras[pricing.extraCode]
          ? pricing.extraCode
          : "none";

      el.support.value =
        String(pricing.support || 0);

      el.privatePromo.checked =
        Number(pricing.privatePromo || 0) > 0;

      el.fitnessCredit.checked =
        Number(pricing.fitnessCredit || 0) > 0;

      el.monthlySponsor.value =
        String(pricing.monthlySponsor || 0);

      el.annualSponsor.value =
        String(pricing.annualSponsor || 0);

      el.athleteList.innerHTML = "";

      if (athletes.length) {
        athletes.forEach((athlete) => {
          addAthlete({
            name:
              athlete.name || "",

            journey:
              athlete.journey ||
              "zero2hero",

            plan:
              athlete.plan ||
              "standard",

            billingTerm:
              athlete.billingTerm ||
              "month-to-month",

            renewalBehavior:
              athlete.renewalBehavior ||
              "month-to-month",

            credit:
              athlete.credit ??
              FOUNDING_YEAR.defaultAdmissionsCredit,

            disciplines:
              Array.isArray(
                athlete.disciplines
              )
                ? athlete.disciplines
                : []
          });
        });
      } else {
        addAthlete({
          disciplines: ["wrestling"]
        });
      }

      calculate();

      const proposalStatus =
        String(
          proposal.status || "DRAFT"
        ).toUpperCase();

      renderProposalWorkflow(
        proposalStatus
      );

      if (proposalStatus === "DRAFT") {
        el.saveDraftButton.disabled = false;
        el.saveDraftButton.textContent =
          `Save ${proposalId}`;

        el.submitReviewButton.disabled = false;
        el.submitReviewButton.textContent =
          "Submit for Review";
      } else {
        document
          .querySelectorAll(
            "main input, main select, main textarea, main button"
          )
          .forEach((control) => {
            control.disabled = true;
          });

        el.printButton.disabled = false;

        el.saveDraftButton.textContent =
          `${proposalId} — ${proposalStatus}`;

        el.submitReviewButton.textContent =
          proposalStatus === "REVIEW"
            ? "Submitted for Review"
            : proposalStatus;

        const canApprove =
          proposalStatus === "REVIEW";

        const canBeginCheckout =
          proposalStatus ===
          "READY_FOR_CHECKOUT";

        const checkoutExists =
          proposalStatus ===
          "CHECKOUT_CREATED";

        el.approveProposalButton.hidden =
          !canApprove;

        el.approveProposalButton.disabled =
          !canApprove;

        el.approveProposalButton.textContent =
          "Approve Proposal";

        el.checkoutProposalButton.hidden =
          !canBeginCheckout &&
          !checkoutExists;

        el.checkoutProposalButton.disabled =
          !canBeginCheckout;

        el.checkoutProposalButton.textContent =
          checkoutExists
            ? "Checkout Created"
            : "Begin Checkout";
          }

      console.log(
        "Proposal loaded:",
        {
          id: snapshot.id,
          ...proposal
        }
      );

      return true;
    }

    function prefillFromAppointment(
      appointment
    ) {
      if (!appointment) {
        return;
      }

      const incoming =
        recommendationFromProgram(
          appointment.programInterest || ""
        );

      const journey =
        appointment.recommendedJourney ||
        incoming.journey ||
        "zero2hero";

      const discipline =
        appointment.recommendedDiscipline ||
        incoming.discipline ||
        "";

      const athleteName =
        appointment.participantName ||
        appointment.athleteName ||
        "";

      const familyName =
        appointment.registrantRole ===
        "adult-athlete"
          ? (
            appointment.participantName ||
            appointment.athleteName ||
            ""
          )
          : (
            appointment.parentName ||
            appointment.registrantName ||
            appointment.contactName ||
            ""
          );

      const coachName =
        appointment.appointmentCoach ||
        appointment.coachName ||
        "Coach Sandoval";

      const recommendation =
        appointment.coachAssessment ||
        "";

      el.familyName.value =
        familyName;

      el.coachName.value =
        coachName;

      el.coachRecommendation.value =
        recommendation;

      el.athleteList.innerHTML = "";

      addAthlete({
        name:
          athleteName,

        journey,

        plan:
          "standard",

        billingTerm:
          "month-to-month",

        renewalBehavior:
          "month-to-month",

        disciplines:
          discipline
            ? [discipline]
            : []
      });

      calculate();

      renderProposalWorkflow(
        "BUILDING"
      );

      console.log(
        "Prospect Builder prefilled from appointment:",
        {
          appointmentId:
            appointment.id,

          familyName,

          athleteName,

          journey,

          discipline,

          startingPath:
            appointment.recommendedStartingPath ||
            appointment.admissionsPath ||
            "",

          familyDecision:
            appointment.enrollmentDecision ||
            "",

          admissionsStatus:
            appointment.admissionsStatus ||
            ""
        }
      );
    }

    function reset(){
      el.familyName.value="";
      el.coachName.value="Coach Sandoval";
      el.coachRecommendation.value="";
      el.extra.value="none";
      el.support.value="0";
      el.privatePromo.checked=false;
      el.fitnessCredit.checked=false;
      el.monthlySponsor.value="0";
      el.annualSponsor.value="0";
      el.athleteList.innerHTML="";
      addAthlete({disciplines:["wrestling"]});
    }


    function escapeHtml(value) {
      return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
    }

    function buildFamilyPrintProposal() {
      const result = calculate();

      if (!result) {
        return false;
      }

      const {
        athletes,
        pricing
      } = result;

      const familyName =
        el.familyName.value.trim() ||
        "Sandman Family";

      const coachName =
        el.coachName.value.trim() ||
        "Coach Sandoval";

      el.printFamilyName.textContent =
        familyName;

      el.printCoachName.textContent =
        coachName;

      el.printDueNow.textContent =
        money(pricing.dueNow);

      el.printMonthly.textContent =
        `${money(
          pricing.monthlyBalance
        )}/month`;

      el.printAnnualRenewal.textContent =
        `${money(
          pricing.annualRenewal
        )}/year`;

      const journeyLabels = {
        zero2hero: "Zero2Hero",
        path2legend: "Path2Legend",
        quest2mastery: "Quest2Mastery",
        fitness: "Everyday Fitness",
        "everyday-fitness": "Everyday Fitness"
      };

      const planLabels = {
        standard: "Combat",
        combo: "Combat + Fitness",
        fitness: "Everyday Fitness"
      };

      const disciplineLabels = {
        wrestling: "Wrestling",
        boxing: "Boxing",
        "muay-thai": "Muay Thai",
        mma: "MMA / Submission Grappling"
      };

      const athleteLines =
        athletes.map((athlete) => {
          const journey =
            journeyLabels[athlete.journey] ||
            athlete.journey ||
            "—";

          const plan =
            planLabels[athlete.plan] ||
            athlete.plan ||
            "Membership";

          const disciplines =
            athlete.plan === "fitness"
              ? "Fitness"
              : athlete.disciplines
                  .map(
                    (discipline) =>
                      disciplineLabels[
                        discipline
                      ] ||
                      discipline
                  )
                  .join(" + ");

          const commitment =
            athlete.billingTerm === "annual"
              ? "12-month agreement + autopay"
              : "Month-to-month";

          return `
            <article class="print-athlete">
              <div>
                <small>Athlete</small>
                <strong>
                  ${escapeHtml(
                    athlete.name || "Athlete"
                  )}
                </strong>
              </div>

              <div>
                <small>Journey</small>
                <span>
                  ${escapeHtml(journey)}
                </span>
              </div>

              <div>
                <small>Program</small>
                <span>
                  ${escapeHtml(
                    disciplines || plan
                  )}
                </span>
              </div>

              <div>
                <small>Membership</small>
                <span>
                  ${escapeHtml(plan)}
                </span>
              </div>

              <div>
                <small>Agreement</small>
                <span>
                  ${escapeHtml(commitment)}
                </span>
              </div>
            </article>
          `;
        })
        .join("");

      el.printAthleteSummary.innerHTML =
        athleteLines;

      /*
       * Savings card
       */
      const annualSavings =
        Number(
          pricing.agreementSavingsAnnual || 0
        );

      const monthlySavings =
        annualSavings / 12;

      if (annualSavings > 0) {
        el.printSavings.textContent =
          money(annualSavings);

        el.printSavingsNote.textContent =
          `${money(
            monthlySavings
          )}/month • over 12 months`;

        el.printSavingsCard.hidden =
          false;
      } else {
        el.printSavingsCard.hidden =
          true;
      }

      /*
       * Rich membership detail.
       *
       * This is family-facing explanation,
       * not Management accounting.
       */
      const detailBlocks =
        athletes.map((athlete) => {
          const plan =
            planLabels[athlete.plan] ||
            "Membership";

          const journey =
            journeyLabels[athlete.journey] ||
            athlete.journey ||
            "—";

          const disciplines =
            athlete.plan === "fitness"
              ? "Fitness"
              : athlete.disciplines
                  .map(
                    (discipline) =>
                      disciplineLabels[
                        discipline
                      ] ||
                      discipline
                  )
                  .join(" + ");

          const annualAgreement =
            athlete.billingTerm === "annual";

          let pricingRows = "";

          if (athlete.plan === "combo") {
            pricingRows += `
              <div class="print-detail-row">
                <span>
                  Regular month-to-month value
                </span>
                <strong>
                  ${money(
                    FOUNDING_YEAR
                      .comboMonthToMonth
                  )}/month
                </strong>
              </div>
            `;

            if (annualAgreement) {
              pricingRows += `
                <div class="print-detail-row">
                  <span>
                    Founding Year agreement rate
                  </span>
                  <strong>
                    ${money(
                      FOUNDING_YEAR
                        .comboAnnualAutopay
                    )}/month
                  </strong>
                </div>

                <div class="print-detail-row">
                  <span>Monthly savings</span>
                  <strong>
                    ${money(
                      FOUNDING_YEAR
                        .comboMonthToMonth -
                      FOUNDING_YEAR
                        .comboAnnualAutopay
                    )}
                  </strong>
                </div>

                <div class="print-detail-row">
                  <span>12-month savings</span>
                  <strong>
                    ${money(
                      (
                        FOUNDING_YEAR
                          .comboMonthToMonth -
                        FOUNDING_YEAR
                          .comboAnnualAutopay
                      ) * 12
                    )}
                  </strong>
                </div>
              `;
            }
          } else if (
            athlete.plan === "standard"
          ) {
            pricingRows += `
              <div class="print-detail-row">
                <span>
                  Founding Year Combat membership
                </span>
                <strong>
                  ${money(
                    FOUNDING_YEAR.combatMonthly
                  )}/month
                </strong>
              </div>
            `;
          } else if (
            athlete.plan === "fitness"
          ) {
            pricingRows += `
              <div class="print-detail-row">
                <span>
                  Everyday Fitness membership
                </span>
                <strong>
                  ${money(
                    FOUNDING_YEAR.fitnessMonthly
                  )}/month
                </strong>
              </div>
            `;
          }

          return `
            <article class="print-detail-card">

              <h3>
                ${escapeHtml(
                  athlete.name || "Athlete"
                )}
              </h3>

              <div class="print-detail-row">
                <span>Journey</span>
                <strong>
                  ${escapeHtml(journey)}
                </strong>
              </div>

              <div class="print-detail-row">
                <span>Program</span>
                <strong>
                  ${escapeHtml(
                    disciplines || plan
                  )}
                </strong>
              </div>

              <div class="print-detail-row">
                <span>Membership</span>
                <strong>
                  ${escapeHtml(plan)}
                </strong>
              </div>

              ${pricingRows}

              <div class="print-detail-row">
                <span>Athlete onboarding</span>
                <strong>
                  ${money(
                    FOUNDING_YEAR
                      .athleteOnboarding
                  )}
                </strong>
              </div>

              <div class="print-detail-row">
                <span>
                  Annual athlete renewal
                </span>
                <strong>
                  ${money(
                    FOUNDING_YEAR
                      .athleteAnnualRenewal
                  )}/year
                </strong>
              </div>

            </article>
          `;
        })
        .join("");

      el.printMembershipDetailContent
        .innerHTML = detailBlocks;

      /*
       * Coach recommendation
       */
      const recommendation =
        el.coachRecommendation.value.trim();

      if (recommendation) {
        el.printRecommendation.textContent =
          recommendation;

        el.printRecommendationSection.hidden =
          false;
      } else {
        el.printRecommendation.textContent =
          "";

        el.printRecommendationSection.hidden =
          true;
      }

      return true;
    }

    el.addAthlete.addEventListener("click",()=>addAthlete());
    el.printButton.addEventListener(
      "click",
      () => {
        if (!buildFamilyPrintProposal()) {
          return;
        }

        window.print();
      }
    );
    el.saveDraftButton.addEventListener("click",saveProposalDraft);
    el.submitReviewButton.addEventListener("click",submitForReview);
    el.approveProposalButton.addEventListener("click",approveCurrentProposal);
    el.checkoutProposalButton.addEventListener("click",beginProposalCheckout);
    el.resetButton.addEventListener("click",reset);

    [
      el.familyName,
      el.coachName,
      el.coachRecommendation,
      el.extra,
      el.support,
      el.privatePromo,
      el.fitnessCredit,
      el.monthlySponsor,
      el.annualSponsor
    ].forEach(control=>{
      control.addEventListener("input",calculate);
      control.addEventListener("change",calculate);
    });

    if (proposalId) {
      loadProposalDraft().catch((error) => {
        console.error(
          "Unable to load proposal draft:",
          error
        );

        alert(
          error?.message ||
          "Unable to load the proposal draft."
        );
      });
    } else if (appointmentId) {
      loadAdmissionsAppointment()
        .then((appointment) => {
          prefillFromAppointment(
            appointment
          );
        })
        .catch((error) => {
          console.error(
            "Unable to load Admissions appointment:",
            error
          );

          alert(
            error?.message ||
            "Unable to load the Admissions appointment."
          );
        });
    } else {
      addAthlete({
        disciplines: ["wrestling"]
      });

      renderProposalWorkflow(
        "BUILDING"
      );
    }
