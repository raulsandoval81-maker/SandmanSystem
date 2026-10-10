import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { validateStagingWebConfig } from "./validate-staging-config.mjs";

const { projectId, config } = validateStagingWebConfig();

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
