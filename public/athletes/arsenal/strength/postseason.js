console.log("Strength Postseason loaded");

const params = new URLSearchParams(window.location.search);
const athleteId = (params.get("id") || "").trim().toUpperCase();

const shell = document.getElementById("postseason-shell");
const backBtn = document.getElementById("backBtn");

if (!athleteId) {
  document.body.innerHTML = "<p>Missing athlete id.</p>";
  throw new Error("Missing athlete id");
}

if (backBtn) {
  backBtn.href = `/athletes/arsenal/strength/?id=${encodeURIComponent(athleteId)}`;
}

async function loadStrengthBlock() {
  if (!shell) {
    console.warn("Postseason shell missing");
    return;
  }

  try {
    const rotation = (params.get("rotation") || "A").trim().toUpperCase();

    const workoutUrl =
      rotation === "B"
        ? "/vault/strength/iron/workoutB.json"
        : "/vault/strength/iron/workoutA.json";

    const res = await fetch(workoutUrl, { cache: "no-store" });
    if (!res.ok) {
      throw new Error(`Failed to load workout: ${res.status}`);
    }

    const data = await res.json();
    const seasonBlock = data?.seasonBlocks?.postseason || null;

    console.log("Strength workout:", data);
    console.log("Postseason block:", seasonBlock);

    const title =
      data?.label ||
      data?.title ||
      `Workout ${rotation}`;

    const desc =
      data?.tagline ||
      data?.description ||
      "Enter the postseason session and begin your assigned work.";

    shell.innerHTML = `
      <div class="section-block">
        <h2 class="section-title">Session 1</h2>
        <p class="lane-desc">${esc(desc)}</p>

        ${
          seasonBlock?.mainLift?.length
            ? `
              <div class="strength-section">
                <h4>Main Lift Preview</h4>
                ${renderExerciseList(seasonBlock.mainLift)}
              </div>
            `
            : ""
        }

        ${
          seasonBlock?.secondaryLift?.length
            ? `
              <div class="strength-section">
                <h4>Secondary Lift Preview</h4>
                ${renderExerciseList(seasonBlock.secondaryLift)}
              </div>
            `
            : ""
        }

        <div style="margin-top:16px;">
          <a
            class="primary-btn"
            href="/athletes/arsenal/strength/postseason/session/index.html?id=${encodeURIComponent(athleteId)}&segment=segment1&n=1&rotation=${encodeURIComponent(rotation)}"
          >
            Enter Session
          </a>
        </div>
      </div>
    `;
  } catch (err) {
    console.error("Strength load failed:", err);

    shell.innerHTML = `
      <div class="section-block">
        <h2 class="section-title">Session 1</h2>
        <p class="lane-desc">Enter the postseason session and begin your assigned work.</p>

        <div style="margin-top:16px;">
          <a
            class="primary-btn"
            href="/athletes/arsenal/strength/postseason/session/index.html?id=${encodeURIComponent(athleteId)}&segment=segment1&n=1&rotation=A"
          >
            Enter Session
          </a>
        </div>
      </div>
    `;
  }
}

function renderExerciseList(items = []) {
  return `
    <ul>
      ${items.map(item => {
        if (typeof item === "string") return `<li>${esc(item)}</li>`;

        const name = item?.exercise || item?.name || "";
        const sets = item?.sets ? ` — ${item.sets}` : "";
        const reps = item?.reps ? ` x ${item.reps}` : "";
        const notes = item?.notes ? ` (${item.notes})` : "";

        return `<li>${esc(`${name}${sets}${reps}${notes}`)}</li>`;
      }).join("")}
    </ul>
  `;
}

function esc(str = "") {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

loadStrengthBlock();