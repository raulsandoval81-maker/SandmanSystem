import {
  db,
  doc,
  functions,
  getDoc,
  httpsCallable,
  ensureSignedIn,
} from "/assets/js/firebase-init.js";
import {
  canViewPlacement,
  familyLabel,
  familyProgressById,
  groupPlacements,
  normalizeCurriculumTier,
  normalizeProgressionTier,
  progressPresentation,
} from "./youth-wrestling-skill-tree-policy.js";

const MANIFEST_URL = "/assets/data/youth-wrestling-placement-manifest.json";
const EXPECTED_VERSION = "r2c-youth-wrestling-placement-v1";
const tree = document.getElementById("youthWrestlingSkillTree");
const message = document.getElementById("skillTreeMessage");

function esc(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function renderSkill(entry, familyProgress) {
  const progress = progressPresentation(entry, familyProgress);
  return `
    <li class="simple-skill" data-card-id="${esc(entry.cardId)}">
      <strong>${esc(entry.skillTitle)}</strong>
      <span class="skill-progress exact-progress">${esc(progress.exactState)}</span>
      ${progress.relatedState ? `<span class="skill-progress family-progress">${esc(progress.relatedState)}</span>` : ""}
    </li>`;
}

function renderRank(group, athlete, familyProgress) {
  const unlocked = canViewPlacement(
    group.placement,
    athlete.progressionTier,
    athlete.curriculumTier
  );
  const extension = group.placement === "CHAMPION_EXTENDED_DEVELOPMENT";

  if (!unlocked) {
    return `
      <section class="rank-tree locked-rank" data-placement="${esc(group.placement)}">
        <h2>${esc(group.name)} <span>${group.skills.length} skills</span></h2>
        <p>${extension ? "Coach-directed development remains available through the existing legacy T7 access path." : "Continue progressing to view this rank's skill titles."}</p>
      </section>`;
  }

  const families = new Map();
  group.skills.forEach((entry) => {
    if (!families.has(entry.familyId)) families.set(entry.familyId, []);
    families.get(entry.familyId).push(entry);
  });

  const familySections = [...families.entries()].map(([familyId, skills]) => `
    <div class="skill-family">
      <h3>${esc(familyLabel(familyId))}</h3>
      <ul>${skills.map((entry) => renderSkill(entry, familyProgress)).join("")}</ul>
    </div>`).join("");

  return `
    <section class="rank-tree" data-placement="${esc(group.placement)}">
      <h2>${esc(group.name)} <span>${group.skills.length} skills</span></h2>
      ${extension ? '<p class="coach-directed">Coach-directed extension. This list does not create a new unlock or certification path.</p>' : ""}
      ${familySections}
    </section>`;
}

async function loadTree() {
  const params = new URLSearchParams(window.location.search);
  const athleteId = String(params.get("id") || params.get("athleteId") || "").trim().toUpperCase();

  if (!athleteId) throw new Error("Missing athlete id");
  if (athleteId.startsWith("F4_")) {
    window.location.replace(`/athletes/arsenal/combat/p2l/wrestling/index.html?id=${encodeURIComponent(athleteId)}`);
    return;
  }

  await ensureSignedIn();
  const [athleteSnap, manifestResponse] = await Promise.all([
    getDoc(doc(db, "athletes", athleteId)),
    fetch(MANIFEST_URL, { cache: "no-cache" }),
  ]);

  if (!athleteSnap.exists()) throw new Error("Athlete not found");
  if (!manifestResponse.ok) throw new Error("Skill tree curriculum unavailable");

  const manifest = await manifestResponse.json();
  if (manifest.version !== EXPECTED_VERSION || manifest.placements?.length !== 121) {
    throw new Error("Skill tree curriculum version mismatch");
  }

  const athleteData = athleteSnap.data() || {};
  const athlete = {
    progressionTier: normalizeProgressionTier(athleteData.progressionTier || athleteData.tier),
    curriculumTier: normalizeCurriculumTier(athleteData.curriculumTier || athleteData.tier),
  };

  let familyProgress = new Map();
  try {
    const result = await httpsCallable(functions, "getAthleteSkillsSummary")({
      athleteId,
      discipline: "wrestling",
    });
    familyProgress = familyProgressById(result.data?.skills);
  } catch (error) {
    console.warn("Youth Wrestling family progress unavailable", error);
  }

  tree.innerHTML = groupPlacements(manifest.placements)
    .map((group) => renderRank(group, athlete, familyProgress))
    .join("");
  tree.hidden = false;
  message.hidden = true;
}

loadTree().catch((error) => {
  console.error("Youth Wrestling skill tree unavailable", error);
  message.textContent = error.message || "Unable to load the skill tree.";
});
