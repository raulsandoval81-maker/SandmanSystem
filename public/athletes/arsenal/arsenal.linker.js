import { resolveSignedInSelfAthlete } from "/assets/js/athlete-dashboard-data.js";
import {
  athleteArsenalPage, canonicalAthleteHref, persistVerifiedAthleteId,
  clearUnverifiedAthleteId,
} from "/assets/js/athlete-journey-routes.js";

const params = new URLSearchParams(location.search);
async function routeArsenal() {
  try {
    const { athleteId, athlete } = await resolveSignedInSelfAthlete();
    if (!athleteId || !athlete) {
      clearUnverifiedAthleteId();
      location.replace("/athletes/auth/");
      return;
    }
    const page = athleteArsenalPage(athlete, athleteId);
    if (!page) {
      clearUnverifiedAthleteId();
      document.body.textContent = "Unable to determine the authorized Arsenal.";
      return;
    }
    persistVerifiedAthleteId(athleteId);
    const discipline = String(
      params.get("discipline") || localStorage.getItem(`sandman_active_discipline_${athleteId}`) || ""
    ).trim();
    location.replace(canonicalAthleteHref(page, athleteId, discipline));
  } catch (error) {
    clearUnverifiedAthleteId();
    document.body.textContent = "Unable to route Arsenal securely. Return to Athlete Access.";
    console.error("[Athlete Arsenal Router] verified lookup failed:", error?.code || "runtime-error");
  }
}
routeArsenal();
