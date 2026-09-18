import {
  db,
  doc,
  getDoc,
  functions,
  httpsCallable,
  ensureSignedIn
} from "/assets/js/firebase-init.js";

const container =
  document.getElementById("canonicalSkills");

const lane =
  document.getElementById("skillsLane");

const getAthleteSkillsSummaryCall =
  httpsCallable(
    functions,
    "getAthleteSkillsSummary"
  );

if (container && lane) {
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

  function normalizeDiscipline(value) {
    return String(value || "")
      .trim()
      .toLowerCase()
      .replace(/[\s_]+/g, "-");
  }

  function esc(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");
  }

  function resolveActiveDiscipline(athlete) {
    const disciplineIds = Array.from(
      new Set(
        [
          ...(Array.isArray(athlete.disciplineIds)
            ? athlete.disciplineIds
            : []),

          ...Object.keys(athlete.disciplines || {}),

          athlete.activeDiscipline,
          athlete.primaryDiscipline,
          athlete.discipline,
          athlete.art,
          athlete.sport
        ]
          .map(normalizeDiscipline)
          .filter(Boolean)
      )
    );

    const requestedDiscipline =
      normalizeDiscipline(
        params.get("discipline") ||
        localStorage.getItem(
          `sandman_active_discipline_${athleteId}`
        ) ||
        ""
      );

    const preferredDiscipline =
      normalizeDiscipline(
        athlete.activeDiscipline ||
        athlete.primaryDiscipline ||
        athlete.discipline ||
        athlete.art ||
        athlete.sport ||
        ""
      );

    if (disciplineIds.length === 1) {
      return disciplineIds[0];
    }

    if (
      requestedDiscipline &&
      disciplineIds.includes(requestedDiscipline)
    ) {
      return requestedDiscipline;
    }

    if (
      preferredDiscipline &&
      disciplineIds.includes(preferredDiscipline)
    ) {
      return preferredDiscipline;
    }

    return disciplineIds[0] || "wrestling";
  }

  async function renderSkills() {
    lane.hidden = true;

    if (!athleteId) {
      return;
    }

    try {
      await ensureSignedIn();

      const athleteSnap =
        await getDoc(
          doc(db, "athletes", athleteId)
        );

      if (!athleteSnap.exists()) {
        return;
      }

      const athlete =
        athleteSnap.data() || {};

      const activeDiscipline =
        resolveActiveDiscipline(athlete);

      if (activeDiscipline !== "wrestling") {
        return;
      }

      lane.hidden = false;

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

      lane.hidden = false;

      container.innerHTML =
        '<p class="muted">Skills are unavailable right now.</p>';
    }
  }

  renderSkills();
}
