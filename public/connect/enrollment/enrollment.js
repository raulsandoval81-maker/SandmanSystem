const params = new URLSearchParams(window.location.search);

const leadId = String(params.get("leadId") || "").trim();
const source = String(params.get("source") || "connect").trim();

const destination = leadId
  ? `/intake-coach/?leadId=${encodeURIComponent(leadId)}&source=${encodeURIComponent(source)}`
  : "/intake-coach/";

window.location.replace(destination);