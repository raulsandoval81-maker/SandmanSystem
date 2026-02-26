const params = new URLSearchParams(location.search);
const mat = params.get("mat");

window.multiMatFeed = window.multiMatFeed || {};
window.multiMatFeed[mat] = {};

window.addEventListener("message", e => {
  if (e.data.mat !== mat) return;

  const { type, payload } = e.data;

  if (type === "score") {
    document.getElementById("redScore").textContent = payload.red;
    document.getElementById("greenScore").textContent = payload.green;
  }
  if (type === "clock") {
    document.getElementById("mainTimer").textContent = payload.time;
  }
  if (type === "log") {
    const div = document.createElement("div");
    div.className = "log-row";
    div.textContent = payload.text;
    document.getElementById("liveLog").prepend(div);
  }
  if (type === "match-info") {
    document.getElementById("eventName").textContent = payload.event;
  }
});
