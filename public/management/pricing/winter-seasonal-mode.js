// Seasonal preview only. This module never submits proposals or creates payments.
const pricingMode = document.getElementById("pricingMode");
const seasonalPanel = document.getElementById("winterSeasonalPanel");
const seasonCount = document.getElementById("winterAthleteCount");
const seasonOption = document.getElementById("winterPayOption");
const seasonDate = document.getElementById("winterEnrollmentDate");
const seasonOutput = document.getElementById("winterSeasonalEstimate");
const missedQuarters = document.getElementById("winterMissedQuarters");
const missedDays = document.getElementById("winterMissedDays");
const amounts = {1:[200,150],2:[400,300],3:[450,350,250],4:[600,450,350],5:[750,550,450]};
const money = n => "$" + n.toLocaleString("en-US");
function render() {
  const seasonal = pricingMode.value === "winter-wrestling";
  seasonalPanel.hidden = !seasonal;
  for (const child of document.querySelectorAll("main.pricing-wrap > *")) {
    if (child === seasonalPanel || child.id === "seasonalModeSelector" || child.classList.contains("pricing-header")) continue;
    child.hidden = seasonal;
  }
  if (!seasonal) return;
  const count = Number(seasonCount.value);
  const total = count * 350;
  const quarters = Number(missedQuarters.value);
  const days = Number(missedDays.value);
  const remainingDays = (4 - quarters) * 16;
  const valid = Number.isInteger(days) && days >= 0 && days <= remainingDays;
  const reduction = valid ? Math.min(total * 0.25, Math.round((total * (quarters / 4 + days / 64)) * 100) / 100) : 0;
  const adjusted = Math.round((total - reduction) * 100) / 100;
  // Existing installment amounts are approved only for the unadjusted
  // seasonal fee. Prorated cases require a separately approved schedule.
  const prorated = reduction > 0;
  const parts = seasonOption.value === "full" || prorated ? [adjusted] : amounts[count];
  const date = seasonDate.value;
  const due = [date || "At enrollment", "2026-12-15", "2027-01-15"];
  const late = date && parts.length > 1 && due.slice(1,parts.length).some(d => d <= date);
  const rows = parts.map((value,i) => "<li>" + money(value) + " — " + (i === 0 ? "At enrollment" : due[i]) + "</li>").join("");
  if (!valid) {
    seasonOutput.textContent = "Invalid missed session-day count: only " + remainingDays + " pricing-days remain after fully missed quarters.";
    return;
  }
  const decimals = n => "$" + n.toLocaleString("en-US", {minimumFractionDigits: 2, maximumFractionDigits: 2});
  seasonOutput.innerHTML = "<p>Original season total: " + decimals(total) + "</p>" +
    "<p>Proration adjustment: -" + decimals(reduction) + " (" + quarters + " full quarters + " + days + " additional pricing-days)</p>" +
    "<p><strong>Adjusted season total: " + decimals(adjusted) + "</strong></p>" +
    (prorated ? "<p><strong>Management approval required:</strong> standard installments do not apply to a prorated season. Approve a new payment schedule after verifying actual missed calendar time and training sessions.</p>" : "<ol>" + rows + "</ol>") +
    (late ? "<p><strong>Management review required:</strong> adjust overdue installment dates before proposing payments.</p>" : "");
}
[pricingMode,seasonCount,seasonOption,seasonDate,missedQuarters,missedDays].forEach(el => el?.addEventListener("change",render));
missedDays?.addEventListener("input",render);
render();
