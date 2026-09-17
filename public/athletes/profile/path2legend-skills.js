import {
  db,
  ensureSignedIn,
  collection,
  getDocs
} from "/assets/js/firebase-init.js";

const container =
  document.getElementById("canonicalSkills");

if (container) {
  const params =
    new URLSearchParams(window.location.search);

  const athleteId =
    String(params.get("id") || "")
      .trim()
      .toUpperCase();

  const STATE_LABELS = Object.freeze({
    LEARNED: "Learned",
    APPLIED: "Applied",
    MASTERED: "Mastered",
    REFINED: "Refined",
  });

  function esc(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");
  }

  async function renderSkills() {
    if (!athleteId) {
      container.innerHTML =
        '<p class="muted">No athlete selected.</p>';
      return;
    }

    try {
      await ensureSignedIn();

      const snapshot = await getDocs(
        collection(
          db,
          "athletes",
          athleteId,
          "skills"
        )
      );

      const skills = [];

      snapshot.forEach((skillDoc) => {
        const record = skillDoc.data() || {};

        const state =
          String(
            record.state ||
            record.status ||
            "NOT_INTRODUCED"
          )
            .trim()
            .toUpperCase();

        if (!STATE_LABELS[state]) return;

        skills.push({
          name:
            String(
              record.name ||
              record.familyId ||
              skillDoc.id
            ).trim(),
          state,
        });
      });

      skills.sort((a, b) =>
        a.name.localeCompare(b.name)
      );

      if (!skills.length) {
        container.innerHTML =
          '<p class="muted">No skills recorded yet.</p>';
        return;
      }

      container.innerHTML = skills
        .map(
          ({ name, state }) => `
            <div class="athlete-skill-row">
              <span class="athlete-skill-name">
                ${esc(name)}
              </span>
              <span class="athlete-skill-state">
                ${STATE_LABELS[state]}
              </span>
            </div>
          `
        )
        .join("");
    } catch (error) {
      console.error(
        "[path2legend-skills] load failed",
        error
      );

      container.innerHTML =
        '<p class="muted">Skills are unavailable right now.</p>';
    }
  }

  renderSkills();
}
