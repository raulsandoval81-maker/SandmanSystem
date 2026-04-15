// ======================================================
// Coach Intake — Review & Mint
// Sandman Systems™
// ======================================================

import {
  db,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  serverTimestamp
} from "../assets/js/firebase-init.js";

const $ = (id) => document.getElementById(id);

// ------------------------------------------------------
// Read ID from URL
// ------------------------------------------------------
const params = new URLSearchParams(location.search);
const subId = params.get("id");
if (!subId) {
  alert("Missing ?id=… in URL");
  throw new Error("No submission ID");
}

// ------------------------------------------------------
// Load submission
// ------------------------------------------------------
async function loadSubmission() {
  const ref = doc(db, "intakeSubmissions", subId);
  const snap = await getDoc(ref);

  if (!snap.exists()) {
    alert("Submission not found.");
    throw new Error("Missing submission");
  }

  const s = snap.data();

  // Fill UI
  $("s-firstlast").textContent = `${s.first || ""} ${s.last || ""}`;
  $("s-dob").textContent = s.dob || "—";
  $("s-city").textContent = s.city || "—";
  $("s-state").textContent = s.state || "—";
  $("s-email").textContent = s.parentEmail || "—";
  $("s-phone").textContent = s.parentPhone || "—";
  $("s-emer").textContent = `${s.emerName || "—"} (${s.emerPhone || "—"})`;
  $("s-med").textContent = s.medical || "—";

  // Pre-fill coach fields
  $("c-city").value = s.city || "";
  $("c-state").value = s.state || "";
}

loadSubmission();

// ------------------------------------------------------
// Mint Virtue Tag Builder
// ------------------------------------------------------
const virtues = [
  "FOCUS","EFFORT","ATTITUDE","RESPECT",
  "COURAGE","HONOR","GRIT","LOYALTY"
];

const virtueSelect = $("mint-virtue");
virtues.forEach(v => {
  const opt = document.createElement("option");
  opt.value = v;
  opt.textContent = v;
  virtueSelect.appendChild(opt);
});

function buildMintTag() {
  const track  = $("mint-track").value; // F8 or F4
  const lane   = $("mint-lane").value;  // CB / LS / SP
  const virtue = $("mint-virtue").value;

  if (!track || !lane || !virtue) return "";

  return `${track}-${lane}-${subId.slice(-4).toUpperCase()}-${virtue}`;
}

function updateMintTag() {
  $("mint-tag-output").value = buildMintTag();
}

["mint-track","mint-lane","mint-virtue"].forEach(id => {
  $(id).addEventListener("change", updateMintTag);
});

updateMintTag();

// ------------------------------------------------------
// Mint F8 or F4 buttons → Build Real UID
// ------------------------------------------------------
$("btn-mint-f8").addEventListener("click", () => mintUID("F8"));
$("btn-mint-f4").addEventListener("click", () => mintUID("F4"));

function mintUID(track) {
  const suffix = subId.slice(-6).toUpperCase();
  const uid = `${track}-${suffix}`;

  $("c-uid").value = uid;
  $("c-track").value = track;
  $("c-tier").value = "T0";
  $("c-rank").value = track === "F8" ? "Shadow" : "Apprentice";
}

// ------------------------------------------------------
// APPROVE & ACTIVATE
// ------------------------------------------------------
$("btn-approve").addEventListener("click", approveAthlete);

async function approveAthlete() {
  const uid = $("c-uid").value;
  if (!uid) {
    alert("Mint UID first.");
    return;
  }

  const subRef = doc(db, "intakeSubmissions", subId);
  const snap = await getDoc(subRef);
  if (!snap.exists()) {
    alert("Submission missing.");
    return;
  }

  const s = snap.data();

  // Coach edits:
  const cInitial = $("c-initial").value.trim();
  const cLast    = $("c-last").value.trim();
  const team     = $("c-team").value.trim();
  const city     = $("c-city").value.trim();
  const state    = $("c-state").value.trim();

  const track = $("c-track").value;
  const tier  = $("c-tier").value;
  const rank  = $("c-rank").value;

  const mintTag = $("mint-tag-output").value;
  const lane    = $("mint-lane").value;

  const athlete = {
    uid,
    fullName: `${s.first} ${s.last}`,
    publicName: `${cInitial} ${cLast}`.trim(),
    dob: s.dob,
    team,
    city,
    state,

    track,
    lane,
    tier,
    rank,

    xp: 0,
    xpHonor: 0,
    xpStrength: 0,

    mintVirtueTag: mintTag,
    mintVirtueTagDisplay: mintTag,

    parentEmail: s.parentEmail,
    parentPhone: s.parentPhone,

    approvedAt: serverTimestamp()
  };

  // Write athlete document
  await setDoc(doc(db, "athletes", uid), athlete);

  // Mark intake as approved
  await updateDoc(subRef, {
    status: "approved",
    approvedAt: serverTimestamp(),
    approvedUid: uid
  });

  $("approve-status").textContent = "✓ Approved!";

  openSuccessModal(uid);
}

// ------------------------------------------------------
// ONBOARDING MODAL
// ------------------------------------------------------
function openSuccessModal(uid) {
  const link = `${location.origin}/athlete-onboarding/?id=${uid}`;
  $("onboarding-link").value = link;

  const modal = $("approval-modal");
  modal.classList.remove("hidden");

  $("copy-link").onclick = () => {
    navigator.clipboard.writeText(link);
  };

  $("open-link").onclick = () => {
    window.open(link, "_blank");
  };
}

$("btn-back").addEventListener("click", () => {
  location.href = "./index.html";
});
