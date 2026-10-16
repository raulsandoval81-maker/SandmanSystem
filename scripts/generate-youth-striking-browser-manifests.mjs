import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const specifications = [
  { module: "youthBoxingPlacementManifest.js", version: "R2C_YOUTH_BOXING_PLACEMENT_VERSION", counts: "R2C_YOUTH_BOXING_APPROVED_COUNTS", placements: "R2C_YOUTH_BOXING_PLACEMENTS", output: "youth-boxing-placement-manifest.json" },
  { module: "youthMuayThaiPlacementManifest.js", version: "R2C_YOUTH_MUAY_THAI_PLACEMENT_VERSION", counts: "R2C_YOUTH_MUAY_THAI_APPROVED_COUNTS", placements: "R2C_YOUTH_MUAY_THAI_PLACEMENTS", output: "youth-muay-thai-placement-manifest.json" },
];

for (const specification of specifications) {
  const manifest = await import(path.join(repoRoot, "functions/lib/policy", specification.module));
  const projection = {
    version: manifest[specification.version],
    approvedCounts: manifest[specification.counts],
    placements: manifest[specification.placements].map((entry) => ({
      cardId: entry.cardId,
      originalCurriculumTier: entry.originalCurriculumTier,
      placement: entry.placement,
      skillTitle: entry.skillTitle,
      familyId: entry.familyId,
      familyMappingStatus: entry.familyMappingStatus,
      curriculumStatus: entry.curriculumStatus,
    })),
  };
  const outputPath = path.join(repoRoot, "public/assets/data", specification.output);
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(projection, null, 2)}\n`, "utf8");
  console.log(`Wrote ${projection.placements.length} placements to ${outputPath}`);
}
