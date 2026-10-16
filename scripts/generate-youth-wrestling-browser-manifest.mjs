import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const serverManifest = await import(
  path.join(repoRoot, "functions/lib/policy/youthWrestlingPlacementManifest.js")
);

const projection = {
  version: serverManifest.R2C_YOUTH_WRESTLING_PLACEMENT_VERSION,
  approvedCounts: serverManifest.R2C_YOUTH_WRESTLING_APPROVED_COUNTS,
  placements: serverManifest.R2C_YOUTH_WRESTLING_PLACEMENTS.map((entry) => ({
    cardId: entry.cardId,
    originalCurriculumTier: entry.originalCurriculumTier,
    placement: entry.placement,
    skillTitle: entry.skillTitle,
    familyId: entry.familyId,
    familyMappingStatus: entry.familyMappingStatus,
    curriculumStatus: entry.curriculumStatus,
  })),
};

const outputPath = path.join(
  repoRoot,
  "public/assets/data/youth-wrestling-placement-manifest.json"
);

await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(projection, null, 2)}\n`, "utf8");
console.log(`Wrote ${projection.placements.length} placements to ${outputPath}`);
