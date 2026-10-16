import { db, doc, functions, getDoc, httpsCallable, ensureSignedIn } from "/assets/js/firebase-init.js";
import {
  canViewPlacement, familyLabel, familyProgressById, groupPlacements,
  progressPresentation, resolveSkillTreeTiers,
} from "/assets/js/youth-simplified-skill-tree-policy.js";

const esc = (value) => String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");

function renderSkill(entry, familyProgress) {
  const progress = progressPresentation(entry, familyProgress);
  return `<li class="simple-skill" data-card-id="${esc(entry.cardId)}"><strong>${esc(entry.skillTitle)}</strong><span class="skill-progress exact-progress">${esc(progress.exactState)}</span>${progress.relatedState ? `<span class="skill-progress family-progress">${esc(progress.relatedState)}</span>` : ""}</li>`;
}

function renderRank(group, athlete, familyProgress) {
  const unlocked = canViewPlacement(group.placement, athlete.progressionTier, athlete.curriculumTier);
  const extension = group.placement === "CHAMPION_EXTENDED_DEVELOPMENT";
  if (!unlocked) return `<section class="rank-tree locked-rank" data-placement="${esc(group.placement)}"><h2>${esc(group.name)} <span>${group.skills.length} skills</span></h2><p>${extension ? "Coach-directed development remains available through the existing legacy T7 access path." : "Continue progressing to view this rank's skill titles."}</p></section>`;
  const families = new Map();
  group.skills.forEach((entry) => { if (!families.has(entry.familyId)) families.set(entry.familyId, []); families.get(entry.familyId).push(entry); });
  const sections = [...families.entries()].map(([familyId, skills]) => `<div class="skill-family"><h3>${esc(familyLabel(familyId))}</h3><ul>${skills.map((entry) => renderSkill(entry, familyProgress)).join("")}</ul></div>`).join("");
  return `<section class="rank-tree" data-placement="${esc(group.placement)}"><h2>${esc(group.name)} <span>${group.skills.length} skills</span></h2>${extension ? '<p class="coach-directed">Coach-directed extension. This list does not create a new unlock or certification path.</p>' : ""}${sections}</section>`;
}

export async function loadYouthSimplifiedSkillTree(config) {
  const tree = document.getElementById(config.treeElementId || "youthSkillTree");
  const message = document.getElementById(config.messageElementId || "skillTreeMessage");
  const params = new URLSearchParams(window.location.search);
  const athleteId = String(params.get("id") || params.get("athleteId") || "").trim().toUpperCase();
  if (!athleteId) throw new Error("Missing athlete id");
  if (athleteId.startsWith("F4_")) {
    window.location.replace(`${config.f4Redirect}?id=${encodeURIComponent(athleteId)}`);
    return;
  }
  await ensureSignedIn();
  const [athleteSnap, manifestResponse] = await Promise.all([getDoc(doc(db, "athletes", athleteId)), fetch(config.manifestUrl, { cache: "no-cache" })]);
  if (!athleteSnap.exists()) throw new Error("Athlete not found");
  if (!manifestResponse.ok) throw new Error("Skill tree curriculum unavailable");
  const manifest = await manifestResponse.json();
  if (manifest.version !== config.expectedVersion || manifest.placements?.length !== 121) throw new Error("Skill tree curriculum version mismatch");
  const data = athleteSnap.data() || {};
  const athlete = resolveSkillTreeTiers(data, config.progressKeys, config.allowLegacyRootFallback);
  let familyProgress = new Map();
  try {
    const result = await httpsCallable(functions, "getAthleteSkillsSummary")({ athleteId, discipline: config.evidenceDiscipline });
    familyProgress = familyProgressById(result.data?.skills);
  } catch (error) {
    console.warn(`${config.label} family progress unavailable`, error);
  }
  tree.innerHTML = groupPlacements(manifest.placements).map((group) => renderRank(group, athlete, familyProgress)).join("");
  tree.hidden = false;
  message.hidden = true;
}

export function startYouthSimplifiedSkillTree(config) {
  loadYouthSimplifiedSkillTree(config).catch((error) => {
    console.error(`${config.label} skill tree unavailable`, error);
    const message = document.getElementById(config.messageElementId || "skillTreeMessage");
    if (message) message.textContent = error.message || "Unable to load the skill tree.";
  });
}
