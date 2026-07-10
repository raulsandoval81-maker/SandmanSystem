import {
  auth,
  db,
  collection,
  getDocs
} from "/assets/js/firebase-init.js";

const appointmentList =
  document.getElementById("appointmentList");

const pageStatus =
  document.getElementById("pageStatus");

const refreshBtn =
  document.getElementById("refreshBtn");

function esc(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function setStatus(message = "", isError = false) {
  if (!pageStatus) return;

  pageStatus.textContent = message;
  pageStatus.className = "page-status";

  if (isError) {
    pageStatus.classList.add("error");
  }
}

function labelForProgram(program = "") {
  const labels = {
    "z2h-wrestling": "Zero2Hero Wrestling",
    "z2h-kickboxing": "Zero2Hero Kickboxing",
    "p2l-wrestling": "Path2Legend Wrestling",
    "p2l-boxing": "Path2Legend Boxing",
    "learning-more": "Just Learning More"
  };

  return labels[program] || program || "—";
}

async function requireAdminUser() {
  // Wait for Firebase Auth to restore the existing login session.
  if (typeof auth.authStateReady === "function") {
    await auth.authStateReady();
  }

  const user = auth.currentUser;

  if (!user) {
    throw new Error("Admin login required.");
  }

  if (user.isAnonymous) {
    throw new Error(
      "Anonymous users cannot access the appointments dashboard."
    );
  }

  const tokenResult =
    await user.getIdTokenResult(true);

  console.log(
    "[appointments] signed in:",
    user.email || user.uid
  );

  console.log(
    "[appointments] token claims:",
    tokenResult.claims
  );

  return user;
}

async function loadAppointments() {
  if (!appointmentList) return;

  setStatus("Loading appointments...");

  try {
    await requireAdminUser();

    const snapshot =
      await getDocs(
        collection(db, "interest_leads")
      );

    const appointments =
      snapshot.docs
        .map((leadDoc) => ({
          id: leadDoc.id,
          ...leadDoc.data()
        }))
        .filter(
          (lead) =>
            lead.status === "appointment_scheduled"
        );

    if (!appointments.length) {
      appointmentList.innerHTML = `
        <div class="empty">
          No appointments are currently scheduled.
        </div>
      `;

      setStatus("0 appointments loaded.");
      return;
    }

    appointmentList.innerHTML =
      appointments
        .map((lead) => `
          <article
            class="appointment-card"
            data-id="${esc(lead.id)}"
          >
            <h2>
              ${esc(
                lead.athleteName ||
                "Unnamed Athlete"
              )}
            </h2>

            <div class="appointment-sub">
              Parent or Guardian:
              ${esc(lead.parentName || "—")}
            </div>

            <div class="appointment-grid">
              <div>
                <span class="field-label">
                  Program
                </span>

                <div class="field-value">
                  ${esc(
                    labelForProgram(
                      lead.programInterest
                    )
                  )}
                </div>
              </div>

              <div>
                <span class="field-label">
                  Phone
                </span>

                <div class="field-value">
                  ${esc(lead.phone || "—")}
                </div>
              </div>

              <div>
                <span class="field-label">
                  Email
                </span>

                <div class="field-value">
                  ${esc(lead.email || "—")}
                </div>
              </div>
            </div>
          </article>
        `)
        .join("");

    setStatus(
      `${appointments.length} appointments loaded.`
    );
  } catch (error) {
    console.error(
      "[appointments] load failed:",
      error
    );

    const message =
      error?.code === "permission-denied"
        ? "Your account is signed in, but Firestore has not granted access to interest leads."
        : error?.message ||
          "Unable to load appointments.";

    setStatus(message, true);
  }
}

refreshBtn?.addEventListener(
  "click",
  loadAppointments
);

await loadAppointments();