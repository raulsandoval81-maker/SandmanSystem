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

  enrollmentStatus.innerHTML =
    leadId
      ? `
        <strong>Admissions Outcome</strong><br><br>

        The admissions appointment has been completed.

        The family has been approved to begin the
        coach-controlled enrollment process.

        <br><br>

        <strong>Next Step</strong>

        <br>

        Click <em>Continue to Enrollment</em> to complete
        athlete intake and activation.

        <br><br>

        <strong>Communication Reminder</strong>

        <br>

        Please encourage families to use
        <strong>email as their primary method of communication</strong>
        whenever possible.

        Email helps us keep appointment details,
        questions, and important information organized.

        Families should reply directly to their
        appointment or enrollment emails whenever
        they need assistance.
      `
      : `
        Continue to the coach-controlled enrollment
        process to begin athlete intake.
      `;
}