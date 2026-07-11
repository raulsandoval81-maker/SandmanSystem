const params =
  new URLSearchParams(window.location.search);

const leadId =
  String(params.get("leadId") || "").trim();

const continueLink =
  document.getElementById("continueLink");

const enrollmentStatus =
  document.getElementById("enrollmentStatus");

const destination =
  leadId
    ? `/intake-coach/?leadId=${encodeURIComponent(leadId)}&source=connect`
    : "/intake-coach/";

if (continueLink) {
  continueLink.href = destination;
}

if (enrollmentStatus) {
  enrollmentStatus.textContent =
    leadId
      ? "The selected family is ready to begin the coach-controlled intake process."
      : "Continue to the coach intake system to begin enrollment.";
}