import { readFile } from "node:fs/promises";
import { loadRelease, validateRemotePreflight } from "./exact-sha-release-policy.mjs";

const [releaseId, markerPath, runtimePath] = process.argv.slice(2);
if (!releaseId || !markerPath || !runtimePath) {
  throw new Error("Usage: verify-exact-sha-remote-preflight.mjs <release-id> <marker-json> <runtime-json>");
}
const release = await loadRelease(releaseId);
const marker = JSON.parse(await readFile(markerPath, "utf8"));
const runtimeByFunction = JSON.parse(await readFile(runtimePath, "utf8"));
validateRemotePreflight(release, { marker, runtimeByFunction });
console.log(`Verified synthetic marker and runtime identities for ${releaseId}.`);
