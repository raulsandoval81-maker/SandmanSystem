// Shared Athlete Communications pages serve both F4 and F8.
// Add the F4 presentation class only when existing Athlete context proves F4.
const params = new URLSearchParams(window.location.search);
const athleteId = String(
  params.get("id") || params.get("athleteId") || params.get("uid") ||
  localStorage.getItem("sandman_lastAthleteUid") ||
  localStorage.getItem("currentAthleteId") ||
  sessionStorage.getItem("currentAthleteId") || ""
).trim().toUpperCase();

function classifyCommunicationsPage() {
  if (athleteId.startsWith("F4_") && document.body) {
    document.body.classList.add("athlete-app", "f4-athlete");
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", classifyCommunicationsPage, { once: true });
} else {
  classifyCommunicationsPage();
}
