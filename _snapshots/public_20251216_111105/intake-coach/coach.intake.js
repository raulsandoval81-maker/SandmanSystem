// ======================================================
// Coach Intake Console — FIXED
// Sandman Systems™
// ======================================================

import {
  db,
  collection,
  doc,
  getDocs,
  setDoc,
  updateDoc,
  query,
  where,
  orderBy,
  serverTimestamp,
} from "../assets/js/firebase-init.js";

const $ = (id) => document.getElementById(id);

// ------------------------------------------------------
// 1) Generate Token (48 hours)
// ------------------------------------------------------
$("btn-make-token")?.addEventListener("click", async () => {
  try {
    const tokenId = crypto.randomUUID().replace(/-/g, "").slice(0, 16);

    const expiresAt = Date.now() + 48 * 60 * 60 * 1000;

    await setDoc(doc(db, "intakes", tokenId), {
      createdAt: serverTimestamp(),
      expiresAt,
      used: false,
      status: "invited",
      forTrack: null,
      forLane: null
    });

    const inviteUrl = `${location.origin}/intake-parent/?invite=${tokenId}`;
    $("invite-link").value = inviteUrl;
    $("invite-status").textContent = "✓ Invite token created (48h).";
  } catch (err) {
    console.error(err);
    $("invite-status").textContent = "⚠ Error creating token.";
  }
});

// ------------------------------------------------------
// 2) Copy Link
// ------------------------------------------------------
$("btn-copy-token")?.addEventListener("click", async () => {
  const url = $("invite-link")?.value;
  if (!url) return;

  await navigator.clipboard.writeText(url);
  $("invite-status").textContent = "✓ Copied to clipboard.";
});

// ------------------------------------------------------
// 3) Open Parent Intake
// ------------------------------------------------------
$("btn-open-qr")?.addEventListener("click", () => {
  const url = $("invite-link")?.value;
  if (!url) return;
  window.open(url, "_blank", "noopener");
});

// ------------------------------------------------------
// 4) Load Pending Intakes (Submitted by Parent)
// ------------------------------------------------------
async function loadPending() {
  try {
    const q = query(
      collection(db, "intakes"),
      where("status", "==", "submitted"),
      orderBy("updatedAt", "desc")
    );

    const snaps = await getDocs(q);

    let html = "";
    let count = 0;

    snaps.forEach((snap) => {
      const d = snap.data();
      count++;

      html += `
        <div class="pending-item">
          <div>
            <strong>${d.first ?? ""} ${d.last ?? ""}</strong><br>
            <span class="muted small">${d.city ?? ""}, ${d.state ?? ""}</span>
          </div>
          <button class="small solid-blue"
            data-token="${snap.id}">
            Review →
          </button>
        </div>
      `;
    });

    $("pending-count").textContent = `${count} pending`;
    $("pending-list").innerHTML =
      html || "<div class='muted small'>No pending intakes.</div>";

    // Wire review buttons
    document
      .querySelectorAll("[data-token]")
      .forEach((btn) => {
        btn.addEventListener("click", () => {
          const tokenId = btn.dataset.token;
          location.href = `/intake-coach/?token=${tokenId}`;
        });
      });

  } catch (err) {
    console.error(err);
    $("pending-list").innerHTML =
      "<div class='muted small'>Error loading pending intakes.</div>";
  }
}

$("btn-find-intakes")?.addEventListener("click", loadPending);
loadPending();

// ------------------------------------------------------
// 5) Load Recently Approved Athletes (Last 30)
// ------------------------------------------------------
async function loadApproved() {
  try {
    const q = query(
      collection(db, "athletes"),
      where("approvedAt", "!=", null),
      orderBy("approvedAt", "desc")
    );

    const snaps = await getDocs(q);
    let html = "";
    let count = 0;

    snaps.forEach((snap) => {
      if (count >= 30) return;
      const a = snap.data();
      count++;

      html += `
        <div class="approved-item small">
          <strong>${a.publicName || a.fullName || a.uid}</strong>
          <span class="muted">(${a.uid})</span>
        </div>
      `;
    });

    $("approved-list").innerHTML =
      html || "<div class='muted small'>—</div>";

  } catch (err) {
    console.error(err);
    $("approved-list").innerHTML =
      "<div class='muted small'>Error loading approvals.</div>";
  }
}

loadApproved();
