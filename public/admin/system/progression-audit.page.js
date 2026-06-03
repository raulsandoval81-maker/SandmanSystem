import {
  runProgressionAudit
} from "../services/progression-audit.service.js";

const cooldownCount = document.getElementById("cooldownCount");
const xpCount = document.getElementById("xpCount");
const stripeCount = document.getElementById("stripeCount");
const tierCount = document.getElementById("tierCount");

const cooldownList = document.getElementById("cooldownList");
const xpList = document.getElementById("xpList");
const stripeList = document.getElementById("stripeList");
const tierList = document.getElementById("tierList");

const refreshBtn = document.getElementById("refreshBtn");

refreshBtn.addEventListener("click", loadAudit);

loadAudit();

async function loadAudit() {

  const results = await runProgressionAudit();

  renderSection(
    cooldownCount,
    cooldownList,
    results.cooldownIssues
  );

  renderSection(
    xpCount,
    xpList,
    results.xpIssues
  );

  renderSection(
    stripeCount,
    stripeList,
    results.stripeIssues
  );

  renderSection(
    tierCount,
    tierList,
    results.tierIssues
  );

}

function renderSection(counterEl, listEl, issues = []) {

  counterEl.textContent = issues.length;

  counterEl.className = "audit-count";

  if (issues.length === 0) {
    counterEl.classList.add("good");
  }
  else if (issues.length < 5) {
    counterEl.classList.add("warn");
  }
  else {
    counterEl.classList.add("bad");
  }

  listEl.innerHTML = "";

  issues.forEach(issue => {

    const div = document.createElement("div");

    div.className = "audit-item";

    div.innerHTML = `
      <strong>${issue.name}</strong><br>
      ${issue.message}
    `;

    listEl.appendChild(div);

  });

}