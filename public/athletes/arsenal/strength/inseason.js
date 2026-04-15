console.log("Strength In-Season Session loaded");
const params = new URLSearchParams(window.location.search);
const id = params.get("id") || "";

window.location.href =
  `/athletes/arsenal/strength/inseason/session/index.html?id=${encodeURIComponent(id)}&session=1&rotation=A`;

async function loadStrengthSession() {
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
    if (!res.ok) {
      throw new Error(`Failed to load workout: ${res.status}`);
    }

    const data = await res.json();
    const seasonBlock = data?.seasonBlocks?.inseason || null;

    console.log("Workout:", data);
    console.log("In-season block:", seasonBlock);

    container.innerHTML = "";

    const block = document.createElement("div");
    block.className = "strength-block";

    block.innerHTML = `
      <h3>${esc(data.label || `Workout ${rotation}`)}</h3>
      <p>${esc(data.tagline || "Stay sharp. Stay ready.")}</p>

      ${renderSection("Main Lift", seasonBlock?.mainLift)}
      ${renderSection("Secondary Lift", seasonBlock?.secondaryLift)}
      ${renderSection("Assistance", seasonBlock?.assistance)}
      ${renderConditioning(seasonBlock?.conditioning)}
    `;

    container.appendChild(block);

  } catch (err) {
    console.error("In-season load failed:", err);
    container.innerHTML = `<p>Failed to load Strength session.</p>`;
  }
}

function renderSection(title, items) {
  if (!items || !items.length) return "";

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
        if (typeof item === "string") {
          return `<li>${esc(item)}</li>`;
        }

        const name = item.exercise || item.name || "";
        const sets = item.sets ? ` — ${item.sets}` : "";
        const reps = item.reps ? ` x ${item.reps}` : "";

        return `<li>${esc(name + sets + reps)}</li>`;
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

loadStrengthSession();