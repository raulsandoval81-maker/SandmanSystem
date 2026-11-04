import { readFile } from "node:fs/promises";
import path from "node:path";
import { manifest, installationReport } from
  "../../scripts/staging/pr451-intake-activation-release.mjs";
import { verifyReviewPrerequisites } from "./pr451-review-prerequisites.mjs";

const root = process.argv[2];
const mode = process.argv[3];
if (!root || (mode && mode !== "--creation-only")) {
  throw new Error("Usage: verify-pr451-intake-activation-invocation.mjs <functions-evidence-dir> [--creation-only]");
}
const read = async name => JSON.parse(await readFile(path.join(root, name), "utf8"));
const records = {};
for (const entry of [...manifest.functions, ...manifest.requiredReviewCallables]) {
  const description = await read(`${entry.name}.json`);
  const invocation = entry.kind.endsWith("callable") ? {
    functionIam: await read(`${entry.name}-function-iam.json`),
  } : undefined;
  if (entry.kind === "gen2-callable") {
    invocation.runService = await read(`${entry.name}-run-service.json`);
    invocation.runIam = await read(`${entry.name}-run-iam.json`);
  }
  records[entry.name] = { description, invocation };
}
verifyReviewPrerequisites(records);
console.log(JSON.stringify(installationReport(records, { creationOnly: mode === "--creation-only" }), null, 2));
