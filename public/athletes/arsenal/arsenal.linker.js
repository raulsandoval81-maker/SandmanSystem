const params = new URLSearchParams(window.location.search);

const athleteId = String(
  params.get("athleteId") ||
  params.get("id") ||
  localStorage.getItem("currentAthleteId") ||
  sessionStorage.getItem("currentAthleteId") ||
  ""
)
  .trim()
  .toUpperCase();

if (!athleteId) {
  document.body.innerHTML =
    "<p>Missing athlete ID.</p>";

  throw new Error("Missing athlete ID");
}

const discipline =
  params.get("discipline") ||
  localStorage.getItem(
    `sandman_active_discipline_${athleteId}`
  ) ||
  "";

const isF8 =
  athleteId.startsWith("F8_");

const target = isF8
  ? "/athletes/arsenal/mini-arsenal.html"
  : "/athletes/arsenal/arsenal.html";

const out =
  new URLSearchParams();

out.set("id", athleteId);

if (discipline) {
  out.set("discipline", discipline);
}

window.location.replace(
  `${target}?${out.toString()}`
);