const PLACEMENTS = [
  ["T0", "Shadow"],
  ["T1", "Prospect"],
  ["T2", "Competitor"],
  ["T3", "Contender"],
  ["T4", "Champion"],
  ["CHAMPION_EXTENDED_DEVELOPMENT", "Champion Extended Development"],
];

const root = document.querySelector("[data-r2c-coach-index]");

function coachCardUrl(originalCardPath) {
  return `/${originalCardPath.replace(/^public\//, "")}`;
}

function renderPlacement(name, entries) {
  const section = document.createElement("section");
  section.className = "placement-section";
  const heading = document.createElement("h2");
  heading.textContent = `${name} — ${entries.length} skills`;
  section.append(heading);

  const grid = document.createElement("div");
  grid.className = "placement-grid";
  for (const entry of entries) {
    const link = document.createElement("a");
    link.className = "placement-card";
    link.href = coachCardUrl(entry.originalCardPath);
    link.innerHTML = `<strong></strong><span></span>`;
    link.querySelector("strong").textContent = entry.skillTitle;
    link.querySelector("span").textContent = `${entry.originalCurriculumTier} · ${entry.cardId}`;
    grid.append(link);
  }
  section.append(grid);
  return section;
}

async function render() {
  if (!root) return;
  const response = await fetch(root.dataset.manifest);
  if (!response.ok) throw new Error(`Placement manifest unavailable (${response.status})`);
  const manifest = await response.json();
  const expected = manifest.approvedCounts;
  const fragment = document.createDocumentFragment();

  for (const [placement, name] of PLACEMENTS) {
    const entries = manifest.placements.filter((entry) => entry.placement === placement);
    if (entries.length !== expected[placement]) {
      throw new Error(`${name} placement count mismatch`);
    }
    fragment.append(renderPlacement(name, entries));
  }
  root.replaceChildren(fragment);
}

render().catch((error) => {
  console.error(error);
  if (root) root.textContent = "Approved placement index is temporarily unavailable.";
});
