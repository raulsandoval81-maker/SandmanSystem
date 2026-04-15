// ======================================================
// Parent Intake → Submit to Firestore
// Sandman Systems™
// ======================================================

import {
  db,
  collection,
  addDoc,
  serverTimestamp
} from "/assets/js/firebase-init.js";
const $ = (id) => document.getElementById(id);

// ------------------------------------------------------
// SUBMIT HANDLER
// ------------------------------------------------------
$("intake-form").addEventListener("submit", async (e) => {
  e.preventDefault();

  // Collect fields
  const first = $("first").value.trim();
  const last = $("last").value.trim();
  const dob = $("dob").value.trim();
  const city = $("city").value.trim();
  const state = $("state").value.trim();
  const parentEmail = $("parentEmail").value.trim();
  const parentPhone = $("parentPhone").value.trim();
  const emerName = $("emerName").value.trim();
  const emerPhone = $("emerPhone").value.trim();
  const medical = $("medical").value.trim();

  // Basic validation
  if (!first || !last || !dob) {
    alert("Please complete all required fields.");
    return;
  }

  // Disable button
const btn = $("submitBtn");
  btn.disabled = true;
  btn.textContent = "Submitting…";

  try {
    // Write to Firestore
    const ref = await addDoc(collection(db, "intakeSubmissions"), {
      first,
      last,
      dob,
      city,
      state,
      parentEmail,
      parentPhone,
      emerName,
      emerPhone,
      medical,
      status: "pending",
      submittedAt: serverTimestamp()
    });

    // Redirect to thank you page
    window.location.href = `./thanks.html?id=${ref.id}`;

  } catch (err) {
    console.error(err);
    alert("Failed to submit. Please try again.");
    btn.disabled = false;
    btn.textContent = "Submit";
  }
});
