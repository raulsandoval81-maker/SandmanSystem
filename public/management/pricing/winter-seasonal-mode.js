// Seasonal preview only. This module never submits proposals or creates payments.
const pricingMode = document.getElementById("pricingMode");
const seasonalPanel = document.getElementById("winterSeasonalPanel");
const seasonCount = document.getElementById("winterAthleteCount");
const seasonOption = document.getElementById("winterPayOption");
const seasonDate = document.getElementById("winterEnrollmentDate");
const seasonOutput = document.getElementById("winterSeasonalEstimate");
const amounts = {1:[200,150],2:[400,300],3:[450,350,250],4:[600,450,350],5:[750,550,450]};
const money = n => "$" + n.toLocaleString("en-US");
function render() {
  const seasonal = pricingMode.value === "winter-wrestling";
  seasonalPanel.hidden = !seasonal;
  for (const child of document.querySelectorAll("main.pricing-wrap > :scope > *")) {
    if (child === seasonalPanel || child.id === "seasonalModeSelector" || child.classList.contains("pricing-header")) continue;
    child.hidden = seasonal;
  }
  if (!seasonal) return;
  const count = Number(seasonCount.value);
  const total = count * 350;
  const parts = seasonOption.value === "full" ? [total] : amounts[count];
  const date = seasonDate.value;
  const due = [date || "At enrollment", "2026-12-15", "2027-01-15"];
  const late = date && parts.length > 1 && due.slice(1,parts.length).some(d => d <= date);
  const rows = parts.map((value,i) => "<li>" + money(value) + " — " + (i === 0 ? "At enrollment" : due[i]) + "</li>").join("");
  seasonOutput.innerHTML = "<p><strong>Season total: " + money(total) + "</strong></p><ol>" + rows + "</ol>" + (late ? "<p><strong>Management review required:</strong> adjust overdue dates before proposing payments.</p>" : "");
}
[pricingMode,seasonCount,seasonOption,seasonDate].forEach(el => el?.addEventListener("change",render));
render();
