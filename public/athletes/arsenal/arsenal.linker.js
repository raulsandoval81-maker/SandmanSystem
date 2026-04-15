const params = new URLSearchParams(window.location.search);
const athleteId = (params.get("id") || "").trim().toUpperCase();

if (!athleteId) {
  document.body.innerHTML = "<p>Missing athlete id.</p>";
  throw new Error("Missing athlete id");
}

const isF8 = athleteId.startsWith("F8_");

const target = isF8
  ? "/athletes/arsenal/mini-arsenal.html"
  : "/athletes/arsenal/arsenal.html";

window.location.replace(`${target}?id=${encodeURIComponent(athleteId)}`);