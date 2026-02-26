import {
  db,
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  query,
  where,
  orderBy,
  serverTimestamp,
  limit,
  onSnapshot
} from "/assets/js/firebase-init.js";
const $ = (id) => document.getElementById(id);

// ------------------------------------------------------
// 1) Generate Token (48 hours)
// ------------------------------------------------------
$("btn-make-token")?.addEventListener("click", async () => {
  try {
    const newTokenId = crypto.randomUUID().replace(/-/g, "").slice(0, 16);
    const exp = Date.now() + 48 * 60 * 60 * 1000;

    await setDoc(doc(db, "intakes", newTokenId), {
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      exp,
      used: false,
      status: "invited",
      forTrack: null,
      forLane: null,
    });

    const inviteUrl = `${location.origin}/intake-parent/?invite=${newTokenId}`;
    if ($("invite-link")) $("invite-link").value = inviteUrl;
    if ($("invite-status")) $("invite-status").textContent = "✓ Invite token created (48h).";
  } catch (err) {
    console.error(err);
    if ($("invite-status")) $("invite-status").textContent = "⚠ Error creating token.";
  }
});

// ------------------------------------------------------
// 2) Copy Link
// ------------------------------------------------------
$("btn-copy-token")?.addEventListener("click", async () => {
  const url = $("invite-link")?.value;
  if (!url) return;
  await navigator.clipboard.writeText(url);
  if ($("invite-status")) $("invite-status").textContent = "✓ Copied to clipboard.";
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
// 4) Load Pending Intakes
// ------------------------------------------------------
let unsubPending = null;

function loadPendingLive() {
  const box = $("pending-list");
  if (!box) return;

  // prevent stacking multiple listeners
  if (typeof unsubPending === "function") unsubPending();

  const qy = query(
    collection(db, "intakes"),
    where("status", "==", "submitted"),
    orderBy("updatedAt", "desc"),
    limit(25)
  );

  unsubPending = onSnapshot(
    qy,
    (snaps) => {
      let html = "";
      let count = 0;

      snaps.forEach((snap) => {
        const d = snap.data() || {};
        const t = snap.id;
        count++;

        const name =
          `${d.athlete?.first ?? ""} ${d.athlete?.last ?? ""}`.trim() ||
          `${d.first ?? ""} ${d.last ?? ""}`.trim() ||
          d.fullName ||
          "(no name)";

        const city = d.location?.city ?? "—";
        const state = d.location?.state ?? "—";

        html += `
          <div class="pending-item">
            <div>
              <strong>${name}</strong>
              <span class="muted small"> (${t.slice(-6)})</span><br>
              <span class="muted small">${city}, ${state}</span>
            </div>
            <button class="small solid-blue" data-token="${t}">Review →</button>
          </div>
        `;
      });

      if ($("pending-count")) $("pending-count").textContent = `${count} pending`;
      box.innerHTML = html || "<div class='muted small'>No pending intakes.</div>";

      document.querySelectorAll("[data-token]").forEach((btn) => {
        btn.addEventListener("click", () => {
          const t = btn.dataset.token;
          location.href = `/intake-coach/review.html?token=${encodeURIComponent(t)}`;
        });
      });
    },
    (err) => {
      console.error(err);
      box.innerHTML = "<div class='muted small'>Error loading pending intakes.</div>";
    }
  );
}
$("btn-find-intakes")?.addEventListener("click", loadPendingLive);
loadPendingLive();

// ------------------------------------------------------
// 5) Load Recently Approved Athletes
// ------------------------------------------------------
async function loadApproved() {
  const box = $("approved-list");
  if (!box) return;

  try {
    const qy = query(
      collection(db, "athletes"),
      orderBy("approvedAt", "desc"),
      limit(10)
    );

    const snaps = await getDocs(qy);

    let html = "";
    snaps.forEach((snap) => {
      const a = snap.data() || {};
      const name = a.publicName || a.fullName || a.uid || snap.id;

      html += `
        <div class="approved-item small">
          <strong>${name}</strong>
          <span class="muted">(${a.uid || snap.id})</span>
        </div>
      `;
    });

    box.innerHTML = html || "<div class='muted small'>—</div>";
  } catch (err) {
    console.error(err);
    box.innerHTML = "<div class='muted small'>Error loading approvals.</div>";
  }
}

loadApproved();
