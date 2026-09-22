import {
  db,
  doc,
  getDoc,
  functions,
  httpsCallable,
  ensureSignedIn
} from "/assets/js/firebase-init.js";
import {
  normalizeDisciplineId as normalizeDiscipline
} from "/assets/js/discipline-policy.js";

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
    String(
      params.get("id") ||
      params.get("uid") ||
      params.get("athleteId") ||
      ""
    )
      .trim()
      .toUpperCase();

  const STATE_LABELS = Object.freeze({
    LEARNED: "Learned",
    APPLIED: "Applied",
    MASTERED: "Mastered",
    REFINED: "Refined"
  });

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

    const urlDiscipline =
      normalizeDiscipline(
        params.get("discipline") || ""
      );

    const storedDiscipline =
      normalizeDiscipline(
        localStorage.getItem(
          `sandman_active_discipline_${athleteId}`
        ) || ""
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
      urlDiscipline &&
      disciplineIds.includes(urlDiscipline)
    ) {
      return urlDiscipline;
    }

    if (
      preferredDiscipline &&
      disciplineIds.includes(preferredDiscipline)
    ) {
      return preferredDiscipline;
    }

    if (
      storedDiscipline &&
      disciplineIds.includes(storedDiscipline)
    ) {
      return storedDiscipline;
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

      if (
        !["wrestling", "boxing", "muay-thai"].includes(
          activeDiscipline
        )
      ) {
        return;
      }

      const canonicalDiscipline =
        normalizeDiscipline(activeDiscipline);

      const disciplineTitles = {
        wrestling: "🤼 Wrestling · Technical progress",
        boxing: "🥊 Boxing · Technical progress",
        "muay-thai": "🥊 Muay Thai · Technical progress"
      };

      const title =
        document.getElementById(
          "skillsDisciplineTitle"
        );

      if (title) {
        title.textContent =
          disciplineTitles[canonicalDiscipline] ||
          "Technical progress";
      }

      lane.hidden = false;

      const result =
        await getAthleteSkillsSummaryCall({
          athleteId,
          discipline: canonicalDiscipline
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
            <div class="skill-progress-row">
              <strong class="skill-progress-name">
                ${esc(
                  skill.name ||
                  skill.familyId ||
                  ""
                )}
              </strong>

              <span class="skill-stage">
                ${STATE_LABELS[state]}
              </span>
            </div>
          `;
        })
        .join("");
    } catch (error) {
      console.error(
        "[road2champion-skills] load failed",
        error
      );

      lane.hidden = false;

      container.innerHTML =
        '<p class="muted">Skills are unavailable right now.</p>';
    }
  }

  renderSkills();
}
