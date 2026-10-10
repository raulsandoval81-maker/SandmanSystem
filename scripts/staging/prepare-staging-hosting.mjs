import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

const productionProject = "sandmandashboard";
const projectId = String(process.env.SANDMAN_STAGING_PROJECT_ID || "").trim();
const acknowledgement = process.env.SANDMAN_STAGING_ACK;
if (!projectId || projectId === productionProject) throw new Error("A non-production SANDMAN_STAGING_PROJECT_ID is required.");
if (acknowledgement !== projectId) throw new Error("SANDMAN_STAGING_ACK must exactly match the staging project ID.");

let config;
try { config = JSON.parse(process.env.SANDMAN_STAGING_WEB_CONFIG || ""); }
catch { throw new Error("SANDMAN_STAGING_WEB_CONFIG must be valid Firebase web-app JSON."); }
if (config.projectId !== projectId) throw new Error("Web config projectId does not match the approved staging project.");
for (const key of ["apiKey", "authDomain", "projectId", "appId"]) {
  if (!String(config[key] || "").trim()) throw new Error(`Staging web config is missing ${key}.`);
}

const root = process.cwd();
const output = path.join(root, ".firebase-staging", "public");
await rm(path.dirname(output), { recursive: true, force: true });
await mkdir(path.dirname(output), { recursive: true });
await cp(path.join(root, "public"), output, { recursive: true });
const runtime = `export const runtimeEnvironment = "staging";\nexport const runtimeFirebaseConfig = Object.freeze(${JSON.stringify(config, null, 2)});\n`;
await writeFile(path.join(output, "assets/js/runtime-environment.js"), runtime, "utf8");
await writeFile(path.join(output, "staging-environment.json"), JSON.stringify({ environment: "staging", projectId, syntheticDataOnly: true }, null, 2) + "\n", "utf8");

const source = await readFile(path.join(output, "assets/js/firebase-init.js"), "utf8");
if (!source.includes("Staging cannot use the production Firebase project")) throw new Error("Staging Firebase fail-closed guard is missing.");
console.log(`Prepared isolated staging hosting for ${projectId}.`);
