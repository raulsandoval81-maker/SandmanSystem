import { spawnSync } from "node:child_process";
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { validateStagingWebConfig } from "./validate-staging-config.mjs";

const { projectId, config } = validateStagingWebConfig();

const root = process.cwd();
const stagingRoot = path.join(root, ".firebase-staging");
const output = path.join(stagingRoot, "public");
// Keep the isolated package beneath functions/ so Firebase discovery can use
// the dependencies installed by `npm ci --prefix functions` in CI.
const functionsOutput = path.join(root, "functions", ".firebase-staging");
await rm(stagingRoot, { recursive: true, force: true });
await rm(functionsOutput, { recursive: true, force: true });
await mkdir(stagingRoot, { recursive: true });
await cp(path.join(root, "public"), output, { recursive: true });
const runtime = `export const runtimeEnvironment = "staging";\nexport const runtimeFirebaseConfig = Object.freeze(${JSON.stringify(config, null, 2)});\n`;
await writeFile(path.join(output, "assets/js/runtime-environment.js"), runtime, "utf8");
await writeFile(path.join(output, "staging-environment.json"), JSON.stringify({ environment: "staging", projectId, syntheticDataOnly: true }, null, 2) + "\n", "utf8");

const source = await readFile(path.join(output, "assets/js/firebase-init.js"), "utf8");
if (!source.includes("Staging cannot use the production Firebase project")) throw new Error("Staging Firebase fail-closed guard is missing.");

const build = spawnSync("npm", ["run", "build", "--prefix", "functions"], {
  cwd: root,
  env: process.env,
  stdio: "inherit",
  shell: false,
});
if (build.status !== 0) throw new Error("Failed to build the isolated staging Functions package.");

await mkdir(functionsOutput, { recursive: true });
await cp(path.join(root, "functions", "lib"), path.join(functionsOutput, "lib"), { recursive: true });
await cp(path.join(root, "functions", "package-lock.json"), path.join(functionsOutput, "package-lock.json"));
const functionsPackage = JSON.parse(await readFile(path.join(root, "functions", "package.json"), "utf8"));
functionsPackage.main = "lib/staging.js";
await writeFile(
  path.join(functionsOutput, "package.json"),
  `${JSON.stringify(functionsPackage, null, 2)}\n`,
  "utf8"
);
await writeFile(
  path.join(functionsOutput, ".env.sandman-combat-staging"),
  [
    "SANDMAN_STAGING_PROJECT_ID=sandman-combat-staging",
    "SANDMAN_STAGING_ACK=sandman-combat-staging",
    "SANDMAN_WRESTLING_RUNTIME_SERVICE_ACCOUNT=sandman-wrestling-runtime@sandman-combat-staging.iam.gserviceaccount.com",
    "",
  ].join("\n"),
  "utf8"
);

console.log(`Prepared isolated staging hosting for ${projectId}.`);
