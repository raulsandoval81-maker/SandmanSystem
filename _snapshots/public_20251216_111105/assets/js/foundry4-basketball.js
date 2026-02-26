// foundry4-basketball.js
document.addEventListener("DOMContentLoaded", () => {
  const KEY = "f4_basketball";
  prime(KEY);
  wireCta(KEY, "#enterProgram");
  console.log("[Foundry4] Basketball page ready.");
});

function prime(key) {
  const now = new Date().toISOString();
  const stash = JSON.parse(localStorage.getItem(key) || "{}");
  localStorage.setItem(
    key,
    JSON.stringify({
      ...stash,
      lastVisit: now,
      visits: (stash.visits || 0) + 1,
    })
  );
}

function wireCta(key, selector) {
  const btn = document.querySelector(selector);
  if (!btn) return;
  btn.addEventListener("click", () => {
    bump(key, "ctaClicks");
    track("f4_basketball_enter");
  });
}

function bump(key, field) {
  const stash = JSON.parse(localStorage.getItem(key) || "{}");
  stash[field] = (stash[field] || 0) + 1;
  localStorage.setItem(key, JSON.stringify(stash));
}

// swap this later for Firebase analytics / events
function track(eventName, payload = {}) {
  console.debug("[track]", eventName, payload);
}
