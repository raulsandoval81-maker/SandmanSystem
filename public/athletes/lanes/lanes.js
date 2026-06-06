import {
  resolveAthleteId,
  getAthleteProfile,
  isFoundry8Id
} from "/assets/js/athlete-profile.js";

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

  const strengthOpen = isF8
    ? tier >= 3 && stripes >= 1
    : stripes >= 1;

  const honorOpen = isF8
    ? tier >= 3 && stripes >= 2
    : stripes >= 2;

  setLocked(linkStrength, !strengthOpen);
  setLocked(linkHonor, !honorOpen);

  const status = document.getElementById("laneStatus");
  if (status) {
    if (isF8) {
      status.textContent =
        !strengthOpen
          ? "Strength unlocks at Competitor, Stripe 1."
          : !honorOpen
            ? "Strength unlocked. Honor unlocks at Competitor, Stripe 2."
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