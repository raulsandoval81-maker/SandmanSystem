import {
  db,
  collection,
  doc,
  getDocs,
  setDoc,
  query,
  where,
  orderBy,
  serverTimestamp,
  limit,
  onSnapshot,
  functions,
  httpsCallable,
} from "/assets/js/firebase-init.js";

import {
  requireManagement
} from "/management/shared/guards/management-guard.js";

import {
  renderManagementLifecycle
} from "/assets/js/management-lifecycle.js";

const $ = (id) => document.getElementById(id);

const requestedProposalId = String(
  new URLSearchParams(location.search)
    .get("proposalId") || ""
).trim();

// ======================================
// Configuration
// ======================================
const INVITE_HOURS = 48;
const RECENT_APPROVED_LIMIT = 3;
const PENDING_LIMIT = 8;

// Management Enrollment owns new-member intake only.
// Existing-athlete discipline changes remain Coach-owned.

function esc(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function inviteUrlForToken(
  tokenId,
  intakeAudience = "parent_guardian"
) {
  const route =
    intakeAudience === "adult_athlete"
      ? "/intake-athlete/"
      : "/intake-parent/";

  return `${location.origin}${route}?invite=${encodeURIComponent(tokenId)}`;
}

function reviewUrlForIntake(intakeId) {
  return `/intake-management/review.html?token=${encodeURIComponent(intakeId)}`;
}

function formatNameFromIntake(d = {}) {
  return (
    `${d.athlete?.first ?? ""} ${d.athlete?.last ?? ""}`.trim() ||
    `${d.first ?? ""} ${d.last ?? ""}`.trim() ||
    d.fullName ||
    "(no name)"
  );
}

function formatCityState(city, state) {
  const c = String(city || "").trim();
  const s = String(state || "").trim();

  if (c && s) return `${c}, ${s}`;
  if (c) return c;
  if (s) return s;
  return "—";
}

function renderPendingCard({ intakeId, name, city, state }) {
  return `
    <div class="pending-card">
      <div class="pending-card-head">
        <div>
          <div class="pending-card-name">${esc(name)}</div>
          <div class="pending-card-meta">${esc(formatCityState(city, state))}</div>
          <div class="pending-card-id">(${esc(intakeId.slice(-6))})</div>
        </div>
      </div>

      <div class="pending-card-actions">
        <button class="small solid-blue" data-intake="${esc(intakeId)}">Review →</button>
      </div>
    </div>
  `;
}

function renderApprovedCard({ uid, name, city, state, parentEmail }) {
  return `
    <div class="pending-card">
      <div class="pending-card-head">
        <div>
          <div class="pending-card-name">${esc(name)}</div>
          <div class="pending-card-meta">${esc(formatCityState(city, state))}</div>
          <div class="pending-card-id">${esc(uid)}</div>
          ${
            parentEmail
              ? `<div class="pending-card-meta small">${esc(parentEmail)}</div>`
              : ""
          }
        </div>
      </div>

      <div class="pending-card-actions">
        <button class="small outline-blue" data-approved-uid="${esc(uid)}">Create Athlete Access</button>
        <button class="small outline-blue" data-parent-uid="${esc(uid)}" data-parent-email="${esc(parentEmail || "")}">Create Parent Access</button>
      </div>
    </div>
  `;
}

// ------------------------------------------------------
// Paid Proposals → Ready for Intake
// ------------------------------------------------------

function paidProposalName(proposal = {}) {
  return (
    proposal.prospect?.familyName ||
    proposal.prospect?.primaryContactName ||
    proposal.athletes?.[0]?.name ||
    proposal.proposalId ||
    "Paid Enrollment"
  );
}

function renderReadyIntakeCard(proposal) {
  const proposalId =
    proposal.proposalId ||
    proposal.id;

  const locationId =
    String(
      proposal.locationId || ""
    ).trim();

  return `
    <div
      class="pending-card"
      data-ready-proposal="${esc(proposalId)}"
    >
      <div class="pending-card-head">
        <div>
          <div class="pending-card-name">
            ${esc(
              paidProposalName(
                proposal
              )
            )}
          </div>

          <div class="pending-card-meta">
            Paid · ${esc(locationId)}
          </div>

          <div class="pending-card-id">
            ${esc(proposalId)}
          </div>
        </div>
      </div>

      <div class="pending-card-actions">
        <button
          class="small solid-blue"
          data-ready-parent="${esc(proposalId)}"
        >
          Parent / Guardian
        </button>

        <button
          class="small outline-blue"
          data-ready-adult="${esc(proposalId)}"
        >
          Adult Athlete
        </button>
      </div>
    </div>
  `;
}

let readyProposalMap =
  new Map();

function orientRequestedProposal() {
  if (!requestedProposalId) return;

  const orientation =
    $("enrollmentCaseOrientation");

  const status =
    $("enrollmentCaseStatus");

  const proposal =
    readyProposalMap.get(
      requestedProposalId
    );

  if (!proposal) {
    if (orientation) {
      orientation.hidden = true;
    }

    if (status) {
      status.textContent =
        "The requested proposal is not available as an authorized paid enrollment. Showing the normal Enrollment queue.";
      status.classList.add("error");
    }

    return;
  }

  if (orientation) {
    orientation.hidden = false;

    renderManagementLifecycle(
      orientation,
      {
        currentStage: "enrollment",
        completedThrough: "checkout",
        currentLabel: "Enrollment",
        caseLabel: requestedProposalId,
        guidance:
          "Choose who will complete Intake; opening this case does not create an invite."
      }
    );
  }

  if (status) {
    status.classList.remove("error");
    status.textContent =
      `${paidProposalName(proposal)} selected from paid proposal ${requestedProposalId}.`;
  }

  const card = document.querySelector(
    `[data-ready-proposal="${CSS.escape(
      requestedProposalId
    )}"]`
  );

  if (card) {
    card.classList.add(
      "is-selected-case"
    );

    card.setAttribute("tabindex", "-1");
    card.focus({ preventScroll: true });
    card.scrollIntoView({
      behavior: "smooth",
      block: "center"
    });
  }
}

function wireReadyIntakeButtons() {
  document
    .querySelectorAll(
      "[data-ready-parent]"
    )
    .forEach((button) => {
      button.addEventListener(
        "click",
        async () => {
          const proposal =
            readyProposalMap.get(
              button.dataset.readyParent
            );

          if (!proposal) return;

          await generateIntakeInvite(
            "parent_guardian",
            proposal
          );
        }
      );
    });

  document
    .querySelectorAll(
      "[data-ready-adult]"
    )
    .forEach((button) => {
      button.addEventListener(
        "click",
        async () => {
          const proposal =
            readyProposalMap.get(
              button.dataset.readyAdult
            );

          if (!proposal) return;

          await generateIntakeInvite(
            "adult_athlete",
            proposal
          );
        }
      );
    });
}

async function loadReadyForIntake(
  managementContext
) {
  const box =
    $("ready-intake-list");

  const count =
    $("ready-intake-count");

  if (!box) return;

  let proposalDocs = [];

  if (
    managementContext.isSystemAdmin
  ) {
    const snapshot =
      await getDocs(
        query(
          collection(
            db,
            "proposals"
          ),
          where(
            "status",
            "==",
            "PAID"
          )
        )
      );

    proposalDocs =
      snapshot.docs;
  } else {
    const locationIds =
      Array.isArray(
        managementContext.scope?.locationIds
      )
        ? managementContext.scope.locationIds
            .map((value) =>
              String(value || "").trim()
            )
            .filter(Boolean)
        : [];

    for (
      let index = 0;
      index < locationIds.length;
      index += 10
    ) {
      const locationChunk =
        locationIds.slice(
          index,
          index + 10
        );

      const snapshot =
        await getDocs(
          query(
            collection(
              db,
              "proposals"
            ),
            where(
              "locationId",
              "in",
              locationChunk
            ),
            where(
              "status",
              "==",
              "PAID"
            )
          )
        );

      proposalDocs.push(
        ...snapshot.docs
      );
    }
  }

  readyProposalMap =
    new Map();

  const proposals =
    proposalDocs.map(
      (proposalDoc) => {
        const proposal = {
          id: proposalDoc.id,
          ...proposalDoc.data()
        };

        readyProposalMap.set(
          proposal.proposalId ||
            proposal.id,
          proposal
        );

        return proposal;
      }
    );

  if (count) {
    count.textContent =
      `${proposals.length} Ready`;
  }

  box.innerHTML =
    proposals.length
      ? `
        <div class="pending-list">
          ${
            proposals
              .map(
                renderReadyIntakeCard
              )
              .join("")
          }
        </div>
      `
      : `
        <div class="muted small">
          No paid enrollments are waiting for intake.
        </div>
      `;

  wireReadyIntakeButtons();
  orientRequestedProposal();
}

// ------------------------------------------------------
// 1) Generate Intake Token (48 hours)
//   Parent / Guardian and Adult Athlete share:
//   token collection → intake collection → management review
// ------------------------------------------------------
async function generateIntakeInvite(
  intakeAudience = "parent_guardian",
  enrollment = null
) {
  try {
    const normalizedAudience =
      intakeAudience === "adult_athlete"
        ? "adult_athlete"
        : "parent_guardian";

    const newTokenId =
      crypto.randomUUID()
        .replace(/-/g, "")
        .slice(0, 16);

    const exp =
      Date.now() +
      INVITE_HOURS * 60 * 60 * 1000;

    const proposalProspect =
      enrollment?.lockedSnapshot?.prospect ||
      enrollment?.prospect ||
      {};

    const proposalAthlete =
      enrollment?.lockedSnapshot?.athletes?.[0] ||
      enrollment?.athletes?.[0] ||
      {};

    const proposalContact =
      enrollment?.lockedSnapshot?.contact ||
      enrollment?.contact ||
      enrollment?.lockedSnapshot?.parent ||
      enrollment?.parent ||
      {};

    function firstValue(...values) {
      for (const value of values) {
        const normalized =
          String(value ?? "").trim();

        if (normalized) {
          return normalized;
        }
      }

      return null;
    }

    const appointmentId =
      firstValue(
        proposalProspect.appointmentId,
        enrollment?.lockedSnapshot?.prospect?.appointmentId,
        enrollment?.appointmentId
      );

    let connectLeadId =
      firstValue(
        proposalProspect.leadId,
        enrollment?.lockedSnapshot?.prospect?.leadId,
        enrollment?.leadId,
        enrollment?.connectLeadId
      );

    // Older or partial proposals may not carry the original
    // lead directly. Recover it through the authoritative
    // admissions appointment so Intake can reuse information
    // Sandman already collected.
    if (!connectLeadId && appointmentId) {
      try {
        const appointmentSnap =
          await getDoc(
            doc(
              db,
              "admissions_appointments",
              appointmentId
            )
          );

        if (appointmentSnap.exists()) {
          const appointment =
            appointmentSnap.data();

          connectLeadId =
            firstValue(
              appointment.leadId,
              appointment.appointmentId,
              appointmentId
            );
        }
      } catch (err) {
        console.warn(
          "[management-enrollment] unable to recover lead for intake prefill:",
          err
        );
      }
    }

    const athleteName =
      firstValue(
        proposalAthlete.name,
        proposalAthlete.fullName,
        proposalAthlete.athleteName,
        [
          proposalAthlete.first,
          proposalAthlete.last
        ]
          .filter(Boolean)
          .join(" "),
        proposalProspect.athleteName,
        enrollment?.athleteName
      );

    // Convenience-only intake prefill.
    // Ownership remains proposalId + locationId.
    // Known enrollment information should carry forward
    // so the family confirms data instead of re-entering it.
    const prefill = Object.fromEntries(
      Object.entries({
        athleteName,

        dob:
          firstValue(
            proposalAthlete.dob,
            proposalAthlete.dateOfBirth,
            proposalProspect.dob,
            proposalProspect.dateOfBirth,
            enrollment?.dob,
            enrollment?.dateOfBirth
          ),

        city:
          firstValue(
            proposalProspect.city,
            proposalContact.city,
            enrollment?.city
          ),

        state:
          firstValue(
            proposalProspect.state,
            proposalContact.state,
            enrollment?.state
          ),

        email:
          firstValue(
            proposalProspect.email,
            proposalProspect.parentEmail,
            proposalProspect.primaryContactEmail,
            proposalContact.email,
            proposalContact.parentEmail,
            enrollment?.email,
            enrollment?.parentEmail
          ),

        phone:
          firstValue(
            proposalProspect.phone,
            proposalProspect.parentPhone,
            proposalProspect.primaryContactPhone,
            proposalContact.phone,
            proposalContact.parentPhone,
            enrollment?.phone,
            enrollment?.parentPhone
          ),

        languagePreference:
          firstValue(
            proposalProspect.languagePreference,
            proposalProspect.preferredLanguage,
            proposalContact.languagePreference,
            enrollment?.languagePreference
          ),
      }).filter(([, value]) => value)
    );

    await setDoc(
      doc(db, "intakeTokens", newTokenId),
      {
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        exp,
        used: false,
        status: "invited",

        mode: "new_athlete",

        intakeAudience:
          normalizedAudience,

        intakeRoute:
          normalizedAudience === "adult_athlete"
            ? "athlete"
            : "parent",

        // Retained neutral fields for intake-token schema compatibility.
        existingAthleteUid: "",
        forTrack: null,
        forLane: null,
        requestedTrackCode: null,
        requestedDiscipline: null,
        existingAthleteName: null,

        proposalId:
          String(
            enrollment?.proposalId || ""
          ).trim() || null,

        connectLeadId:
          connectLeadId || null,

        locationId:
          String(
            enrollment?.locationId || ""
          ).trim() || null,

        prefill,

        source: "management_enrollment",
        workflowVersion: "intake-v2",
      }
    );

    const inviteUrl =
      inviteUrlForToken(
        newTokenId,
        normalizedAudience
      );

    if ($("invite-link")) {
      $("invite-link").value =
        inviteUrl;
    }

    if ($("invite-route-label")) {
      $("invite-route-label").textContent =
        normalizedAudience === "adult_athlete"
          ? "Adult Athlete Intake → /intake-athlete/"
          : "Parent / Guardian Intake → /intake-parent/";
    }

    if ($("invite-status")) {
      $("invite-status").textContent =
        normalizedAudience === "adult_athlete"
          ? `✓ Adult athlete intake created (${INVITE_HOURS}h).`
          : `✓ Parent / guardian intake created (${INVITE_HOURS}h).`;
    }

  } catch (err) {
    console.error(err);

    if ($("invite-status")) {
      $("invite-status").textContent =
        `⚠ ${
          err?.message ||
          "Error creating intake invite."
        }`;
    }
  }
}

// ------------------------------------------------------
// 2) Copy Link
// ------------------------------------------------------
$("btn-copy-token")?.addEventListener("click", async () => {
  try {
    const url = $("invite-link")?.value;
    if (!url) return;

    await navigator.clipboard.writeText(url);

    if ($("invite-status")) {
      $("invite-status").textContent = "✓ Copied to clipboard.";
    }
  } catch (err) {
    console.error(err);
    if ($("invite-status")) {
      $("invite-status").textContent = "⚠ Copy failed.";
    }
  }
});

// ------------------------------------------------------
// 3) Open Generated Intake
// ------------------------------------------------------
$("btn-open-qr")?.addEventListener("click", () => {
  const url = $("invite-link")?.value;
  if (!url) return;
  window.open(url, "_blank", "noopener");
});

// ------------------------------------------------------
// 4) Load Pending Intakes (Live)
//   Reads from: intakes (submitted)
//   Pending = approvedUid is null (not minted yet)
// ------------------------------------------------------
let unsubPending = null;

function wirePendingButtons() {
  document.querySelectorAll("[data-intake]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const intakeId = btn.dataset.intake;
      if (!intakeId) return;
      location.href = reviewUrlForIntake(intakeId);
    });
  });
}

function loadPendingLive() {
  const box = $("pending-list");
  if (!box) return;

  if (typeof unsubPending === "function") unsubPending();

  const qy = query(
    collection(db, "intakes"),
    where("approvedUid", "==", null),
    orderBy("createdAt", "desc"),
    limit(PENDING_LIMIT)
  );

  unsubPending = onSnapshot(
    qy,
    (snaps) => {
      let html = "";
      let count = 0;

      snaps.forEach((snap) => {
        const d = snap.data() || {};
        const intakeId = snap.id;

        count += 1;

        html += renderPendingCard({
          intakeId,
          name: formatNameFromIntake(d),
          city: d.location?.city ?? "",
          state: d.location?.state ?? "",
        });
      });

      if ($("pending-count")) {
        $("pending-count").textContent = `${count} pending`;
      }

      box.innerHTML = html
        ? `<div class="pending-list">${html}</div>`
        : "<div class='muted small'>No pending intakes.</div>";

      wirePendingButtons();
    },
    (err) => {
      console.error(err);
      box.innerHTML = "<div class='muted small'>Error loading pending intakes.</div>";
    }
  );
}

$("btn-find-intakes")?.addEventListener("click", loadPendingLive);

// ------------------------------------------------------
// 5) Load Recently Approved Athletes
// ------------------------------------------------------
function wireApprovedButtons() {
  document.querySelectorAll("[data-approved-uid]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const uid = btn.dataset.approvedUid;
      if (!uid) return;

      const originalLabel = btn.textContent;
      btn.disabled = true;
      btn.textContent = "Creating Access…";

      try {
        const createToken = httpsCallable(
          functions,
          "createAthleteOnboardingToken"
        );

        const response = await createToken({
          athleteUid: uid,
        });

        const tokenId = String(
          response?.data?.tokenId || ""
        ).trim();

        if (!tokenId) {
          throw new Error(
            "Athlete access token was not returned."
          );
        }

        const onboardingUrl =
          `${location.origin}/athlete-onboarding/` +
          `?id=${encodeURIComponent(uid)}` +
          `&token=${encodeURIComponent(tokenId)}`;

        window.open(
          onboardingUrl,
          "_blank",
          "noopener"
        );
      } catch (err) {
        console.error(
          "Create Athlete Access failed:",
          err
        );

        alert(
          err?.message ||
          "Unable to create Athlete Access."
        );
      } finally {
        btn.disabled = false;
        btn.textContent = originalLabel;
      }
    });
  });

  document.querySelectorAll("[data-parent-uid]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const uid = btn.dataset.parentUid;
      const email = String(btn.dataset.parentEmail || "").trim().toLowerCase();
      if (!uid || !email) {
        alert("This athlete does not have an approved Parent email.");
        return;
      }
      const originalLabel = btn.textContent;
      btn.disabled = true;
      btn.textContent = "Creating Access…";
      try {
        const issue = httpsCallable(functions, "issueAccessInvitation");
        const response = await issue({ role: "parent", athleteUid: uid, email });
        const tokenId = String(response?.data?.tokenId || "").trim();
        if (!tokenId) throw new Error("Parent invitation token was not returned.");
        const url = `${location.origin}/access/first-time/?role=parent&token=${encodeURIComponent(tokenId)}&email=${encodeURIComponent(email)}`;
        window.open(url, "_blank", "noopener");
      } catch (error) {
        console.error("Create Parent Access failed:", error);
        alert(error?.message || "Unable to create Parent Access.");
      } finally {
        btn.disabled = false;
        btn.textContent = originalLabel;
      }
    });
  });
}

async function loadApproved() {
  const box = $("approved-list");
  if (!box) return;

  try {
    const qy = query(
      collection(db, "athletes"),
      orderBy("createdAt", "desc"),
      limit(RECENT_APPROVED_LIMIT)
    );

    const snaps = await getDocs(qy);

    let html = "";

    snaps.forEach((snap) => {
      const a = snap.data() || {};
      const uid = a.uid || snap.id;
      const name = a.publicName || a.fullName || uid;

      html += renderApprovedCard({
        uid,
        name,
        city: a.city || "",
        state: a.state || "",
        parentEmail: a.parentEmail || "",
      });
    });

    box.innerHTML = html
      ? `<div class="pending-list">${html}</div>`
      : "<div class='muted small'>No recent approvals.</div>";

    wireApprovedButtons();
  } catch (err) {
    console.error(err);
    box.innerHTML = "<div class='muted small'>Error loading approvals.</div>";
  }
}



// ------------------------------------------------------
// Boot: Management authority first, THEN query/list
// ------------------------------------------------------
(async () => {
  try {
    const managementContext =
      await requireManagement();

    await loadReadyForIntake(
      managementContext
    );

    loadPendingLive();
    loadApproved();
  } catch (err) {
    console.error(
      "[management-enrollment] boot failed:",
      err
    );

    if ($("ready-intake-list")) {
      $("ready-intake-list").textContent =
        err?.message ||
        "Unable to load enrollment workspace.";
    }

    if (
      requestedProposalId &&
      $("enrollmentCaseStatus")
    ) {
      $("enrollmentCaseStatus").textContent =
        "The requested enrollment case could not be loaded. The workspace remains unchanged.";
      $("enrollmentCaseStatus").classList.add(
        "error"
      );
    }
  }
})();
