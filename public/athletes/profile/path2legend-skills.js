import {
  functions,
  httpsCallable,
  ensureSignedIn
} from "/assets/js/firebase-init.js";

const container =
  document.getElementById("canonicalSkills");

const getAthleteSkillsSummaryCall =
  httpsCallable(
    functions,
    "getAthleteSkillsSummary"
  );

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

      const result =
        await getAthleteSkillsSummaryCall({
          athleteId
        });

      const skills =
        Array.isArray(result.data?.skills)
          ? result.data.skills
          : [];

      if (!skills.length) {
        container.innerHTML =
          '<p class="muted">No skills recorded yet.</p>';
        return;
      }

      container.innerHTML = skills
        .map((skill) => {
          const state =
            String(skill.state || "")
              .trim()
              .toUpperCase();

          if (!STATE_LABELS[state]) {
            return "";
          }

          return `
            <div class="athlete-skill-row">
              <span class="athlete-skill-name">
                ${esc(
                  skill.name ||
                  skill.familyId ||
                  ""
                )}
              </span>
              <span class="athlete-skill-state">
                ${STATE_LABELS[state]}
              </span>
            </div>
          `;
        })
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
