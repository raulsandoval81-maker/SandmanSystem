import {
  db,
  collection,
  getDocs,
  query,
  where,
  orderBy,
  doc,
  updateDoc,
  serverTimestamp
} from "/assets/js/firebase-init.js";

const grid = document.getElementById("requestGrid");

loadRequests();

async function loadRequests() {
  grid.innerHTML = "<div>Loading...</div>";

  try {
    const q = query(
      collection(db, "paraParentInbox"),
      where("stage", "==", "gatekeeper"),
      orderBy("createdAt", "desc")
    );

    const snap = await getDocs(q);

    if (snap.empty) {
      grid.innerHTML = `
        <div class="empty">
          No gatekeeper requests found.
        </div>
      `;
      return;
    }

    grid.innerHTML = "";

    snap.forEach((docSnap) => {
      const data = docSnap.data();

      const id = docSnap.id;
      const status = data.adminGatekeeperStatus || "new";
      const hasQuestion = data.hasPublicMessage === true;
      const parentEmail = data.parentEmail || "";

      const coachEmail = "joinsandmancombat@gmail.com";

      const mailSubject = encodeURIComponent("Sandman Combat Follow Up");

      const mailBody = encodeURIComponent(
`Hello ${data.parentName || ""},

Thank you for reaching out to Sandman Combat.

We received your request for:
${data.entryType || "Gatekeeper Request"}

Athlete:
${data.athleteName || "-"}

Your message:
${data.publicMessage || "(No custom message attached)"}

Response:

`
      );

      const coachSubject = encodeURIComponent("Gatekeeper Heads-Up");

      const coachBody = encodeURIComponent(
`Coach,

New gatekeeper request.

Parent:
${data.parentName || "-"}

Parent Email:
${data.parentEmail || "-"}

Athlete:
${data.athleteName || "-"}

Entry Type:
${data.entryType || "-"}

Auto Email:
${data.autoReplySent ? "Sent" : "Missing"}

Admin Status:
${status.toUpperCase()}

Message:
${data.publicMessage || "(No custom message attached)"}

Admin Note:

`
      );

      const card = document.createElement("div");
      card.className = "card";

      card.innerHTML = `
        <div class="top">
          <div class="badge ${hasQuestion ? "reply" : "auto"}">
            ${hasQuestion ? "Needs Reply" : "Auto Handled"}
          </div>

          <div class="muted">
            ${escapeHtml(data.entryType || "")}
          </div>
        </div>

        <div class="name">
          ${escapeHtml(data.parentName || "Unknown Parent")}
        </div>

        <div class="line">
          <strong>Email:</strong><br>
          ${escapeHtml(parentEmail || "-")}
        </div>

        <div class="line">
          <strong>Athlete:</strong><br>
          ${escapeHtml(data.athleteName || "-")}
        </div>

        <div class="line">
          <strong>Auto Email:</strong>
          ${data.autoReplySent ? "Sent" : "Missing"}
        </div>

        ${
          hasQuestion
            ? `
              <div class="message">
                ${escapeHtml(data.publicMessage || "")}
              </div>
            `
            : `
              <div class="message empty">
                No custom message attached.
              </div>
            `
        }

        <div class="line">
          <strong>Status:</strong>
          ${escapeHtml(status.toUpperCase())}
        </div>

        <div class="actions">
          <a
            class="mail-btn"
            href="mailto:${escapeAttr(parentEmail)}?subject=${mailSubject}&body=${mailBody}">
            Open Email
          </a>

          <a
            class="mail-btn"
            href="mailto:${escapeAttr(coachEmail)}?subject=${coachSubject}&body=${coachBody}">
            Notify Coach
          </a>

          <button
            class="copy-email-btn"
            data-email="${escapeAttr(parentEmail)}">
            Copy Email
          </button>

          <button data-id="${id}" data-status="reviewed">
            Mark Reviewed
          </button>

          <button data-id="${id}" data-status="responded">
            Mark Responded
          </button>

          <button data-id="${id}" data-status="closed">
            Close
          </button>
        </div>
      `;

      grid.appendChild(card);

      card.querySelectorAll("button[data-status]").forEach((btn) => {
        btn.addEventListener("click", async () => {
          const nextStatus = btn.dataset.status;
          const requestId = btn.dataset.id;

          await updateDoc(doc(db, "paraParentInbox", requestId), {
            adminGatekeeperStatus: nextStatus,
            adminGatekeeperStatusUpdatedAt: serverTimestamp()
          });

          loadRequests();
        });
      });

      card.querySelectorAll(".copy-email-btn").forEach((btn) => {
        btn.addEventListener("click", async () => {
          const email = btn.dataset.email || "";

          if (!email) return;

          await navigator.clipboard.writeText(email);

          btn.textContent = "Copied";

          setTimeout(() => {
            btn.textContent = "Copy Email";
          }, 1200);
        });
      });
    });
  } catch (err) {
    console.error(err);

    grid.innerHTML = `
      <div class="empty">
        Failed to load requests.
      </div>
    `;
  }
}

function escapeHtml(str = "") {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function escapeAttr(str = "") {
  return escapeHtml(str).replaceAll("`", "&#96;");
}