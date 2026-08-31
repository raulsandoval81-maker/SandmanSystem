import {
  resolveAthleteId,
  getAthleteProfile,
  isFoundry8Id
} from "/assets/js/athlete-profile.js";
import { resolveF8RemoteAccess } from "/assets/js/f8-strength-honor-access.js";

function setLocked(el, locked) {
  if (!el) return;
  el.classList.toggle("locked", !!locked);
  el.setAttribute("aria-disabled", locked ? "true" : "false");

  if (locked) {
    el.onclick = (e) => e.preventDefault();
  } else {
    el.onclick = null;
  }
}

function setHrefWithId(a, id) {
  if (!a) return;
  const base = a.getAttribute("href") || "/";
  a.setAttribute("href", base.replace(/\?.*$/, "") + `?id=${encodeURIComponent(id)}`);
}

function tierNumber(profile = {}) {
  const raw = profile.tier ?? profile.tierCode ?? profile.currentTier ?? "T0";
  const match = String(raw).toUpperCase().match(/T(\d+)/);
  return match ? Number(match[1]) : Number(raw) || 0;
}

(async function boot() {
  const athleteId = resolveAthleteId();

  const linkStrength = document.getElementById("link-strength");
  const linkHonor = document.getElementById("link-honor");

  setHrefWithId(linkStrength, athleteId);
  setHrefWithId(linkHonor, athleteId);

  const profile = await getAthleteProfile(athleteId);

  const stripes = Number(profile?.stripesEarned ?? profile?.stripeCount ?? 0);
  const tier = tierNumber(profile);
  const isF8 = isFoundry8Id(athleteId);

  if (linkStrength) linkStrength.style.display = "";
  if (linkHonor) linkHonor.style.display = "";

const f8RemoteAccess = isF8 ? resolveF8RemoteAccess(profile) : null;
const strengthOpen = isF8
  ? f8RemoteAccess.strength
  : profile?.unlocks?.strength === true || stripes >= 1;
const honorOpen = isF8
  ? f8RemoteAccess.honor
  : profile?.unlocks?.honor === true || stripes >= 2;

  setLocked(linkStrength, !strengthOpen);
  setLocked(linkHonor, !honorOpen);

  const status = document.getElementById("laneStatus");
  if (status) {
    if (isF8) {
      status.textContent =
        !strengthOpen || !honorOpen
          ? "Remote Strength + Honor unlock at Prospect Stripe 1."
          : "Strength + Honor unlocked.";
    } else {
      status.textContent =
        !strengthOpen
          ? "Earn Stripe 1 to unlock Strength."
          : !honorOpen
            ? "Strength unlocked. Earn Stripe 2 to unlock Honor."
            : "Strength + Honor unlocked.";
    }
  }
})();
