import { db, doc, functions, getDoc, httpsCallable, ensureSignedIn } from "/assets/js/firebase-init.js";
import { escapeSkillTreeText as esc, familyLabel, familyProgressById, groupFiveTierPlacements, normalizeFiveTier, progressPresentation } from "/assets/js/simplified-skill-tree-presentation.js";

const root = document.getElementById("path2LegendSkillTree");
const message = document.getElementById("skillTreeMessage");
const discipline = root?.dataset.discipline || "";
const manifestUrl = root?.dataset.manifest || "";
const expectedVersions = Object.freeze({ wrestling: "path2legend-wrestling-skill-tree-v1", kickboxing: "path2legend-kickboxing-skill-tree-v1" });

function disciplineProgress(athlete) {
  const aliases = discipline === "kickboxing" ? ["kickboxing", "muay-thai", "muayThai"] : [discipline];
  for (const collection of [athlete.disciplines, athlete.combat, athlete.progression, athlete.disciplineProgress]) {
    if (!collection || typeof collection !== "object") continue;
    for (const alias of aliases) if (collection[alias]) return collection[alias];
  }
  return null;
}

function renderSkill(entry, progress) {
  const state = progressPresentation(entry, progress);
  return `<li class="simple-skill" data-card-id="${esc(entry.cardId)}"><strong>${esc(entry.skillTitle)}</strong><span class="skill-progress exact-progress">${esc(state.exactState)}</span>${state.relatedState ? `<span class="skill-progress family-progress">${esc(state.relatedState)}</span>` : ""}</li>`;
}

function renderRank(group, currentTier, progress) {
  const accessible = Number(group.tier.slice(1)) <= Number(currentTier.slice(1));
  if (!accessible) return `<section class="rank-tree locked-rank" data-tier="${group.tier}"><h2>${esc(group.rankName)} <span>${group.skills.length} skills</span></h2><p>Continue progressing to view this rank's skill titles.</p></section>`;
  const grouped = new Map();
  group.skills.forEach((entry) => { const key = entry.familyId || "skills"; if (!grouped.has(key)) grouped.set(key, []); grouped.get(key).push(entry); });
  const sections = [...grouped.entries()].map(([familyId, skills]) => `<div class="skill-family">${familyId === "skills" ? "" : `<h3>${esc(familyLabel(familyId))}</h3>`}<ul>${skills.map((entry) => renderSkill(entry, progress)).join("")}</ul></div>`).join("");
  return `<section class="rank-tree" data-tier="${group.tier}"><h2>${esc(group.rankName)} <span>${group.skills.length} skills</span></h2>${sections}</section>`;
}

async function loadTree() {
  if (!root || !["wrestling", "kickboxing"].includes(discipline) || !manifestUrl) throw new Error("Unsupported Path2Legend skill tree");
  const params = new URLSearchParams(window.location.search);
  const athleteId = String(params.get("id") || params.get("athleteId") || "").trim().toUpperCase();
  if (!athleteId) throw new Error("Missing athlete id");
  if (athleteId.startsWith("F8_")) { window.location.replace(`/athletes/arsenal/combat/z2h/${discipline}/index.html?id=${encodeURIComponent(athleteId)}`); return; }
  await ensureSignedIn();
  const [athleteSnap, manifestResponse] = await Promise.all([getDoc(doc(db, "athletes", athleteId)), fetch(manifestUrl, { cache: "no-cache" })]);
  if (!athleteSnap.exists()) throw new Error("Athlete not found");
  if (!manifestResponse.ok) throw new Error("Skill tree curriculum unavailable");
  const athlete = athleteSnap.data() || {};
  if (athlete.active === false || athlete.rosterStatus === "suspended") throw new Error("Account suspended. Please contact your coach.");
  const record = disciplineProgress(athlete);
  if (record?.state === "suspended") throw new Error("Account suspended. Please contact your coach.");
  // Match combat-lock: an explicitly requested discipline with no independent
  // progress record begins at T0 and never inherits another discipline's tier.
  const currentTier = normalizeFiveTier(record?.tier || record?.tierCode || record?.currentTier || "T0");
  const manifest = await manifestResponse.json();
  if (manifest.version !== expectedVersions[discipline] || manifest.discipline !== discipline) throw new Error("Skill tree curriculum version mismatch");
  let progress = new Map();
  try {
    const result = await httpsCallable(functions, "getAthleteSkillsSummary")({ athleteId, discipline: discipline === "kickboxing" ? "muay-thai" : discipline });
    progress = familyProgressById(result.data?.skills);
  } catch (error) { console.warn("Path2Legend family progress unavailable", error); }
  root.innerHTML = groupFiveTierPlacements(manifest).map((group) => renderRank(group, currentTier, progress)).join("");
  root.hidden = false;
  message.hidden = true;
}

loadTree().catch((error) => { console.error("Path2Legend skill tree unavailable", error); message.textContent = error.message || "Unable to load the skill tree."; });
