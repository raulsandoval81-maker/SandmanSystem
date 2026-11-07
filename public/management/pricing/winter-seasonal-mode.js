// Management's Winter Wrestling panel is informational only.
// All seasonal pricing/approval occurs in the verified Admissions → Prospect Builder flow.
// Never calculate a separate installment schedule or create a checkout here.
const pricingMode = document.getElementById("pricingMode");
const seasonalPanel = document.getElementById("winterSeasonalPanel");
const page = document.querySelector("main.pricing-wrap");

function renderSeasonalRoute() {
  if (!pricingMode || !seasonalPanel || !page) return;
  const seasonal = pricingMode.value === "winter-wrestling";
  seasonalPanel.hidden = !seasonal;
  for (const child of page.children) {
    if (child === seasonalPanel || child.id === "seasonalModeSelector" ||
        child.classList.contains("pricing-header")) continue;
    child.hidden = seasonal;
  }
}

pricingMode?.addEventListener("change", renderSeasonalRoute);
renderSeasonalRoute();
