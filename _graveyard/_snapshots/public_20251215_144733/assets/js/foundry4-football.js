// foundry4-football.js
document.addEventListener("DOMContentLoaded", () => {
  const KEY = "f4_football";
  prime(KEY);
  wireCta(KEY, "#enterProgram");
  console.log("[Foundry4] Football page ready.");
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
    track("f4_football_enter");
  });
}

function bump(key, field) {
  const stash = JSON.parse(localStorage.getItem(key) || "{}");
  stash[field] = (stash[field] || 0) + 1;
  localStorage.setItem(key, JSON.stringify(stash));
}

function track(eventName, payload = {}) {
  console.debug("[track]", eventName, payload);
}
