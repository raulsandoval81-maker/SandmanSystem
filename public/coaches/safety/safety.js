import {
  db,
  ensureSignedIn,
  collection,
  query,
  where,
  getDocs,
  limit
} from "/assets/js/firebase-init.js";

await ensureSignedIn();

const athleteIdInput =
  document.getElementById("athleteSearch") ||
  document.getElementById("athleteIdInput");

const lookupBtn =
  document.getElementById("lookupBtn");

const statusEl =
  document.getElementById("status");

const safetyProfile =
  document.getElementById("profileBox") ||
  document.getElementById("safetyProfile");

function setStatus(msg, isError = false) {
  statusEl.textContent = msg;
  statusEl.style.color = isError ? "#fecaca" : "#ffdd48";
}

function escapeHTML(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function row(label, value) {
  return `
    <div class="profile-row">
      <div class="label">${escapeHTML(label)}</div>
      <div class="value">${escapeHTML(value || "—")}</div>
    </div>
  `;
}

async function findAthlete(term) {
  const clean = String(term || "").trim();
  const upper = clean.toUpperCase();

  const checks = [
    ["uid", upper],
    ["uidCode", upper],
    ["dogTag", upper],
    ["mintVirtueTag", upper],
    ["publicName", clean],
    ["name", clean]
  ];

  for (const [field, value] of checks) {
    if (!value) continue;

    const snap = await getDocs(
      query(
        collection(db, "athletes"),
        where(field, "==", value),
        limit(1)
      )
    );

    if (!snap.empty) {
      const docSnap = snap.docs[0];
      return {
        id: docSnap.id,
        ...docSnap.data()
      };
    }
  }

  return null;
}

function renderProfile(a) {
  safetyProfile.classList.remove("hidden");

  const parent = a.parent || {};
  const emergency = a.emergency || {};
  const medical = a.medical || a.medicalNotes || "";

  safetyProfile.innerHTML = `
    <h3>Safety Profile</h3>

    ${row("Athlete", a.publicName || a.name || a.fullName || a.id)}
    ${row("UID", a.uid || a.uidCode || a.id)}
    ${row("DOB / Age", a.dob || a.age || "")}

    ${row("Parent / Guardian", parent.name || a.parentName || "")}
    ${row("Parent Phone", parent.phoneDigits || parent.phone || a.parentPhone || "")}
    ${row("Parent Email", parent.email || a.parentEmail || "")}

    ${row("Emergency Contact", emergency.name || a.emergencyName || "")}
    ${row("Emergency Phone", emergency.phoneDigits || emergency.phone || a.emergencyPhone || "")}

    ${row("Medical Notes", medical)}
    ${row("Team / Location", a.team?.name || a.teamName || a.locationId || "")}
  `;
}

lookupBtn?.addEventListener("click", async () => {
  const term = athleteIdInput?.value?.trim() || "";

  if (!term) {
    setStatus("Enter athlete UID, tag, or name.", true);
    return;
  }

  try {
    setStatus("Looking up safety profile...");
    safetyProfile?.classList.add("hidden");

    const athlete = await findAthlete(term);

    if (!athlete) {
      setStatus("No athlete found.", true);
      return;
    }

    renderProfile(athlete);
    setStatus("Safety profile loaded.");
  } catch (err) {
    console.error("[safety] lookup failed:", err);
    setStatus("Lookup failed. Check console.", true);
  }
});