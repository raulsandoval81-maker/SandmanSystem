import {
  auth,
  db,
  collection,
  getDocs,
  query,
  where
} from "/assets/js/firebase-init.js";

import {
  signOut
} from "https://www.gstatic.com/firebasejs/10.13.1/firebase-auth.js";

import {
  managementLoginUrl,
  requireManagement
} from "/management/shared/guards/management-guard.js";


const managerIdentity =
  document.getElementById("managerIdentity");

const locationScope =
  document.getElementById("locationScope");

const programScope =
  document.getElementById("programScope");

const accessScope =
  document.getElementById("accessScope");

const statusEl =
  document.getElementById("status");

const signOutBtn =
  document.getElementById("signOutBtn");


function clean(value) {
  return String(value ?? "").trim();
}


function setStatus(
  message = "",
  isError = false
) {
  if (!statusEl) return;

  statusEl.textContent = message;

  statusEl.classList.toggle(
    "error",
    isError
  );
}


function formatScope(
  values,
  fallback
) {
  if (
    Array.isArray(values) &&
    values.length
  ) {
    return values.join(", ");
  }

  return fallback;
}


function displayName(context) {
  return (
    clean(context.staff.fullName) ||
    clean(context.staff.displayName) ||
    clean(context.user.email) ||
    "Approved Management Account"
  );
}



// =========================================================
// MANAGEMENT DASHBOARD PULSE
// Read-only operational counts.
// Does not alter pipeline state.
// =========================================================

const dashboardLeadCount =
  document.getElementById(
    "dashboardLeadCount"
  );

const dashboardLeadDetail =
  document.getElementById(
    "dashboardLeadDetail"
  );

const dashboardAppointmentCount =
  document.getElementById(
    "dashboardAppointmentCount"
  );

const dashboardAppointmentDetail =
  document.getElementById(
    "dashboardAppointmentDetail"
  );

const dashboardProposalCount =
  document.getElementById(
    "dashboardProposalCount"
  );

const dashboardProposalDetail =
  document.getElementById(
    "dashboardProposalDetail"
  );

const dashboardEnrollmentCount =
  document.getElementById(
    "dashboardEnrollmentCount"
  );

const dashboardEnrollmentDetail =
  document.getElementById(
    "dashboardEnrollmentDetail"
  );


function managementLocationIds(context) {
  if (context.isSystemAdmin) {
    return null;
  }

  return Array.isArray(
    context.scope?.locationIds
  )
    ? context.scope.locationIds
        .map((value) =>
          clean(value)
        )
        .filter(Boolean)
    : [];
}


async function readScopedCollection(
  context,
  collectionName
) {
  const locationIds =
    managementLocationIds(context);

  if (locationIds === null) {
    const snapshot =
      await getDocs(
        collection(
          db,
          collectionName
        )
      );

    return snapshot.docs.map(
      (snapshotDoc) => ({
        id: snapshotDoc.id,
        ...snapshotDoc.data()
      })
    );
  }

  if (!locationIds.length) {
    return [];
  }

  const records = new Map();

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
            collectionName
          ),
          where(
            "locationId",
            "in",
            locationChunk
          )
        )
      );

    for (const snapshotDoc of snapshot.docs) {
      records.set(
        snapshotDoc.id,
        {
          id: snapshotDoc.id,
          ...snapshotDoc.data()
        }
      );
    }
  }

  return Array.from(
    records.values()
  );
}


function appointmentDateValue(
  appointment
) {
  const value =
    appointment.appointmentDate ||
    appointment.date ||
    appointment.scheduledDate ||
    appointment.appointment?.date ||
    null;

  if (!value) {
    return null;
  }

  if (
    typeof value.toDate === "function"
  ) {
    return value.toDate();
  }

  const date =
    new Date(value);

  return Number.isFinite(
    date.getTime()
  )
    ? date
    : null;
}


async function loadManagementDashboard(
  context
) {
  try {
    const [
      leads,
      appointments,
      proposals
    ] = await Promise.all([
      readScopedCollection(
        context,
        "interest_leads"
      ),

      readScopedCollection(
        context,
        "admissions_appointments"
      ),

      readScopedCollection(
        context,
        "proposals"
      )
    ]);

    const newLeads =
      leads.filter((lead) =>
        (
          lead.leadStatus ||
          lead.status ||
          "new"
        ) === "new"
      ).length;

    const contactedLeads =
      leads.filter((lead) =>
        (
          lead.leadStatus ||
          lead.status ||
          ""
        ) === "contacted"
      ).length;

    if (dashboardLeadCount) {
      dashboardLeadCount.textContent =
        String(leads.length);
    }

    if (dashboardLeadDetail) {
      dashboardLeadDetail.textContent =
        `${newLeads} new · ${contactedLeads} contacted`;
    }

    const today =
      new Date();

    today.setHours(
      0,
      0,
      0,
      0
    );

    const upcomingAppointments =
      appointments.filter(
        (appointment) => {
          const status =
            clean(
              appointment.appointmentStatus ||
              appointment.status ||
              appointment.appointment?.status
            ).toLowerCase();

          const date =
            appointmentDateValue(
              appointment
            );

          const isActive =
            ![
              "completed",
              "cancelled",
              "canceled",
              "closed"
            ].includes(status);

          return (
            isActive &&
            (
              !date ||
              date >= today
            )
          );
        }
      );

    const todayAppointments =
      upcomingAppointments.filter(
        (appointment) => {
          const date =
            appointmentDateValue(
              appointment
            );

          if (!date) {
            return false;
          }

          const comparison =
            new Date(date);

          comparison.setHours(
            0,
            0,
            0,
            0
          );

          return (
            comparison.getTime() ===
            today.getTime()
          );
        }
      ).length;

    if (dashboardAppointmentCount) {
      dashboardAppointmentCount.textContent =
        String(
          upcomingAppointments.length
        );
    }

    if (dashboardAppointmentDetail) {
      dashboardAppointmentDetail.textContent =
        `${todayAppointments} scheduled today`;
    }

    const activeProposals =
      proposals.filter(
        (proposal) =>
          clean(
            proposal.status
          ).toUpperCase() !== "VOID"
      );

    const checkoutReady =
      proposals.filter(
        (proposal) =>
          clean(
            proposal.status
          ).toUpperCase() ===
          "READY_FOR_CHECKOUT"
      ).length;

    const paymentPending =
      proposals.filter(
        (proposal) =>
          [
            "CHECKOUT_CREATED",
            "PAYMENT_PENDING"
          ].includes(
            clean(
              proposal.status
            ).toUpperCase()
          )
      ).length;

    if (dashboardProposalCount) {
      dashboardProposalCount.textContent =
        String(
          activeProposals.length
        );
    }

    if (dashboardProposalDetail) {
      dashboardProposalDetail.textContent =
        `${checkoutReady} checkout ready · ${paymentPending} payment pending`;
    }

    const paidProposals =
      proposals.filter(
        (proposal) =>
          clean(
            proposal.status
          ).toUpperCase() === "PAID"
      );

    if (dashboardEnrollmentCount) {
      dashboardEnrollmentCount.textContent =
        String(
          paidProposals.length
        );
    }

    if (dashboardEnrollmentDetail) {
      dashboardEnrollmentDetail.textContent =
        paidProposals.length === 1
          ? "1 paid family ready for intake"
          : `${paidProposals.length} paid families ready for intake`;
    }

    console.log(
      "[management-hub] dashboard loaded:",
      {
        leads: leads.length,
        appointments:
          upcomingAppointments.length,
        proposals:
          activeProposals.length,
        checkoutReady,
        paymentPending,
        paid:
          paidProposals.length
      }
    );

  } catch (error) {
    console.error(
      "[management-hub] dashboard load failed:",
      error
    );

    if (dashboardLeadDetail) {
      dashboardLeadDetail.textContent =
        "Activity unavailable";
    }

    if (dashboardAppointmentDetail) {
      dashboardAppointmentDetail.textContent =
        "Activity unavailable";
    }

    if (dashboardProposalDetail) {
      dashboardProposalDetail.textContent =
        "Activity unavailable";
    }

    if (dashboardEnrollmentDetail) {
      dashboardEnrollmentDetail.textContent =
        "Activity unavailable";
    }
  }
}


function renderManagementContext(context) {
  managerIdentity.textContent =
    `${displayName(context)} — ${
      context.user.email || "Authenticated"
    }`;

  if (context.isSystemAdmin) {
    locationScope.textContent =
      "All locations";

    programScope.textContent =
      "All programs";

    accessScope.textContent =
      "System Admin Oversight";

    setStatus(
      "System Admin oversight access verified."
    );

    return;
  }

  locationScope.textContent =
    formatScope(
      context.scope.locationIds,
      "No location assignment"
    );

  programScope.textContent =
    formatScope(
      context.scope.programIds,
      "All assigned-location programs"
    );

  accessScope.textContent =
    "Operational Management";

  setStatus(
    "Management access verified."
  );
}


async function startManagementHub() {
  try {
    const context =
      await requireManagement();

    renderManagementContext(context);

    await loadManagementDashboard(
      context
    );

    console.log(
      "[management-hub] access granted:",
      {
        uid: context.user.uid,
        email: context.user.email,
        role: context.role,
        scope: context.scope
      }
    );

  } catch (error) {
    console.error(
      "[management-hub] access denied:",
      error
    );

    setStatus(
      error?.message ||
      "Management access could not be verified.",
      true
    );

    const noAuthenticatedUser =
      !auth.currentUser ||
      auth.currentUser.isAnonymous;

    window.setTimeout(
      () => {
        window.location.replace(
          noAuthenticatedUser
            ? managementLoginUrl()
            : "/login/"
        );
      },
      1200
    );
  }
}


signOutBtn?.addEventListener(
  "click",
  async () => {
    await signOut(auth);

    window.location.replace(
      "/login/"
    );
  }
);


void startManagementHub();

// =========================================================
// MANAGEMENT_DASHBOARD_DRAWER
// Mobile navigation only. Does not alter auth or pipeline.
// =========================================================

const managementSidebar =
  document.getElementById("managementSidebar");

const menuToggleBtn =
  document.getElementById("menuToggleBtn");

const sidebarBackdrop =
  document.getElementById("sidebarBackdrop");

const sidebarSignOutBtn =
  document.getElementById("sidebarSignOutBtn");


function setSidebarOpen(open) {
  if (!managementSidebar) return;

  managementSidebar.classList.toggle(
    "is-open",
    open
  );

  menuToggleBtn?.setAttribute(
    "aria-expanded",
    String(open)
  );

  if (sidebarBackdrop) {
    sidebarBackdrop.hidden = !open;
  }

  document.body.style.overflow =
    open ? "hidden" : "";
}


menuToggleBtn?.addEventListener(
  "click",
  () => {
    const open =
      !managementSidebar?.classList.contains(
        "is-open"
      );

    setSidebarOpen(open);
  }
);


sidebarBackdrop?.addEventListener(
  "click",
  () => {
    setSidebarOpen(false);
  }
);


document.addEventListener(
  "keydown",
  (event) => {
    if (event.key === "Escape") {
      setSidebarOpen(false);
    }
  }
);


managementSidebar
  ?.querySelectorAll("a")
  .forEach((link) => {
    link.addEventListener(
      "click",
      () => {
        if (
          window.matchMedia(
            "(max-width: 820px)"
          ).matches
        ) {
          setSidebarOpen(false);
        }
      }
    );
  });


sidebarSignOutBtn?.addEventListener(
  "click",
  async () => {
    await signOut(auth);

    window.location.replace(
      "/login/"
    );
  }
);
