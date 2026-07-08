export function renderDigitalBelt({
  colorClass = "belt-white",
  stripes = 0,
  size = "medium",
  percent = 0
}) {
  const safeStripes = Math.max(0, Math.min(4, Number(stripes || 0)));

  const safePercent = Math.max(
    0,
    Math.min(1, Number(percent || 0))
  );

  const masterClasses = [
    "belt-p2l-legend",
    "belt-r2g-craftsman",
    "belt-q2m-master"
  ];

  const masterClass = masterClasses.includes(colorClass)
    ? " master"
    : "";

  return `
    <div class="sm-belt ${size}${masterClass}">
      <div class="sm-belt-body ${colorClass}"></div>

      <div class="sm-belt-patch">
        <div class="sm-belt-text">
          SANDMAN SYSTEM
        </div>

        <div class="sm-belt-stripes">
          ${[0, 1, 2, 3].map(i => `
            <span class="sm-stripe ${i < safeStripes ? "filled" : ""}"></span>
          `).join("")}
        </div>
      </div>
    </div>
  `;
}