import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

const root = resolve(process.argv[2] || "");
const manifest = JSON.parse(readFileSync(new URL("./paid-in-full-v2-preflight.json", import.meta.url), "utf8"));
function git(...args) {
  return execFileSync("git", ["-C", root, ...args], { encoding: "utf8" }).trim();
}
if (manifest.projectId !== "sandman-combat-staging" ||
    manifest.repository !== "raulsandoval81-maker/SandmanSystem" ||
    manifest.deploymentAuthorized !== false ||
    manifest.productionChangesAuthorized !== false ||
    manifest.firestoreWritesAuthorized !== false ||
    manifest.stripeOperationsAuthorized !== false ||
    manifest.secretReadsAuthorized !== false ||
    manifest.functionTarget !== "recordProposalPrepaidCash") {
  throw new Error("Unapproved release policy");
}
if (git("rev-parse", "HEAD") !== manifest.applicationSha) {
  throw new Error("Immutable source SHA mismatch");
}
const changed = git("diff", "--name-only", manifest.ancestorSha, manifest.applicationSha).split("\n").filter(Boolean);
if (JSON.stringify(changed) !== JSON.stringify(manifest.changedFiles)) {
  throw new Error("Unexpected application diff");
}
for (const file of manifest.hostingFiles) {
  if (!manifest.changedFiles.includes("public" + file)) throw new Error("Unexpected Hosting file: " + file);
}
console.log(JSON.stringify({
  status: "READ_ONLY_SOURCE_PREFLIGHT_PASS",
  sourceSha: manifest.applicationSha,
  functionTarget: manifest.functionTarget,
  hostingFiles: manifest.hostingFiles,
  changedFiles: changed.length,
  deploymentAuthorized: false
}, null, 2));
