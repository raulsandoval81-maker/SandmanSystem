export function renderDigitalBelt({
  colorClass = "belt-white",
  stripes = 0,
  size = "medium",
  percent = 0
}) {

  const safeStripes = Math.max(0, Math.min(4, stripes));

  const safePercent = Math.max(
    0,
    Math.min(1, Number(percent || 0))
  );

  const fillPct = `${safePercent * 100}%`;

  return `
    <div class="sm-belt ${size}">
      
      <div class="sm-belt-body ${colorClass}"></div>

      <div class="sm-belt-patch">
        <div class="sm-belt-text">
          SANDMAN SYSTEM
        </div>

        <div class="sm-belt-stripes">
          ${[0,1,2,3].map(i => `
            <span class="sm-stripe ${i < safeStripes ? "filled" : ""}"></span>
          `).join("")}
        </div>
      </div>

    </div>
  `;
}