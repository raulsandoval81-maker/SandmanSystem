import { resolveAthleteId, getAthleteProfile, isFoundry8Id } from "/assets/js/athlete-profile.js";

function setLocked(el, locked) {
  if (!el) return;
  el.classList.toggle("locked", !!locked);
  el.setAttribute("aria-disabled", locked ? "true" : "false");
  if (locked) el.addEventListener("click", (e) => e.preventDefault(), { once: true });
}

function setHrefWithId(a, id) {
  if (!a) return;
  const base = a.getAttribute("href") || "/";
  a.setAttribute("href", base.replace(/\?.*$/, "") + `?id=${encodeURIComponent(id)}`);
}

(async function boot() {
  const athleteId = resolveAthleteId();

  // rewrite links immediately so they always carry id forward
  const linkStrength = document.getElementById("link-strength");
  const linkHonor = document.getElementById("link-honor");
  setHrefWithId(linkStrength, athleteId);
  setHrefWithId(linkHonor, athleteId);

  const profile = await getAthleteProfile(athleteId);

  // If Foundry 8: hide lanes completely (your rule)
  if (isFoundry8Id(athleteId)) {
    if (linkStrength) linkStrength.style.display = "none";
    if (linkHonor) linkHonor.style.display = "none";
    const msg = document.getElementById("laneStatus");
    if (msg) msg.textContent = "Strength & Honor unlock later (Foundry 4 only).";
    return;
  }

  const stripes = Number(profile?.stripesEarned ?? profile?.stripeCount ?? 0);

  // Stripe gates
  setLocked(linkStrength, stripes < 2);
  setLocked(linkHonor, stripes < 3);

  const status = document.getElementById("laneStatus");
  if (status) {
    status.textContent =
      stripes < 2 ? "Earn Stripe 2 to unlock Strength."
    : stripes < 3 ? "Strength unlocked. Earn Stripe 3 to unlock Honor."
    : "Strength + Honor unlocked.";
  }
})();