console.log("Strength Preseason loaded");

const params = new URLSearchParams(window.location.search);
const id = params.get("id") || "";

window.location.href =
  `/athletes/arsenal/strength/preseason/session/index.html?id=${encodeURIComponent(id)}&session=1&rotation=A`;

async function loadStrengthBlock() {
  const container = document.getElementById("strength-content");

  if (!container) {
    console.warn("Strength container missing");
    return;
  }

  try {
    const params = new URLSearchParams(window.location.search);
    const rotation = (params.get("rotation") || "A").toUpperCase();

    const workoutUrl =
      rotation === "B"
        ? "/vault/strength/iron/workoutB.json"
        : "/vault/strength/iron/workoutA.json";

    const res = await fetch(workoutUrl, { cache: "no-store" });
    if (!res.ok) throw new Error(`Failed to load workout: ${res.status}`);

    const data = await res.json();
    const seasonBlock = data?.seasonBlocks?.preseason || null;

    container.innerHTML = "";

    const block = document.createElement("div");
    block.className = "strength-block";

    block.innerHTML = `
      <h3>${esc(data.label || `Workout ${rotation}`)}</h3>
      <p>${esc(data.tagline || "Build the base. Stay disciplined.")}</p>

      ${renderSection("Main Lift", seasonBlock?.mainLift)}
      ${renderSection("Secondary Lift", seasonBlock?.secondaryLift)}
      ${renderSection("Assistance", seasonBlock?.assistance)}
      ${renderConditioning(seasonBlock?.conditioning)}
    `;

    container.appendChild(block);
  } catch (err) {
    console.error("Preseason load failed:", err);
    container.innerHTML = `<p>Failed to load Strength content.</p>`;
  }
}

function renderSection(title, items) {
  if (!items?.length) return "";
  return `
    <div class="strength-section">
      <h4>${title}</h4>
      ${renderExerciseList(items)}
    </div>
  `;
}

function renderConditioning(cond) {
  if (!cond?.options?.length) return "";
  return `
    <div class="strength-section">
      <h4>Conditioning</h4>
      <ul>
        ${cond.options.map(x => `<li>${esc(x)}</li>`).join("")}
      </ul>
    </div>
  `;
}

function renderExerciseList(items = []) {
  return `
    <ul>
      ${items.map(item => {
        if (typeof item === "string") return `<li>${esc(item)}</li>`;
        return `<li>${esc(item.exercise || "")} — ${esc(item.sets || "")} x ${esc(item.reps || "")}</li>`;
      }).join("")}
    </ul>
  `;
}

function esc(str = "") {
  return String(str)
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#39;");
}

loadStrengthBlock();