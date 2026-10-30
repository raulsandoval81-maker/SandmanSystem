import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { loadRelease } from "./exact-sha-release-policy.mjs";

const [releaseId, sourceRootArg, outputRootArg] = process.argv.slice(2);
if (!releaseId || !sourceRootArg || !outputRootArg) {
  throw new Error("Usage: prepare-exact-sha-release.mjs <release-id> <application-root> <output-root>");
}
const release = await loadRelease(releaseId);
const sourceRoot = path.resolve(sourceRootArg);
const outputRoot = path.resolve(outputRootArg);
const hostingRoot = path.join(outputRoot, "public");
const functionsRoot = path.join(outputRoot, "functions");
const billingReleaseIds = new Set(["billing-pr354-014198ea", "billing-pr376-dff3e6d3"]);

await rm(outputRoot, { recursive: true, force: true });
await mkdir(outputRoot, { recursive: true });
// Exclude only the known empty placeholder whose literal asterisk makes
// GitHub Actions artifacts non-portable. Never silently omit other files.
const sourcePublic = path.join(sourceRoot, "public");
const invalidPlaceholder = path.join(sourcePublic, "vendor", "firebase", "10.13.1", "*.map files");
if (release.hostingBaselineSha) {
  const archiveRoot = await mkdtemp(path.join(os.tmpdir(), "sandman-hosting-baseline-"));
  const archive = path.join(archiveRoot, "public.tar");
  try {
    const archived = spawnSync("git", ["-C", sourceRoot, "archive", "--format=tar", `--output=${archive}`, release.hostingBaselineSha, "public"],
      { stdio: "inherit", shell: false });
    if (archived.status !== 0) throw new Error("Failed to read the immutable Hosting baseline.");
    const extracted = spawnSync("tar", ["-xf", archive, "-C", archiveRoot], { stdio: "inherit", shell: false });
    if (extracted.status !== 0) throw new Error("Failed to extract the immutable Hosting baseline.");
    await cp(path.join(archiveRoot, "public"), hostingRoot, { recursive: true,
      filter: candidate => candidate !== path.join(archiveRoot, "public", "vendor", "firebase", "10.13.1", "*.map files") });
    for (const file of release.hostingFiles) {
      const relative = path.relative("public", file);
      const destination = path.join(hostingRoot, relative);
      await mkdir(path.dirname(destination), { recursive: true });
      await cp(path.join(sourceRoot, file), destination);
      const pinnedBlob = release.inheritedHostingFileGitShas?.[file];
      if (pinnedBlob) {
        const result = spawnSync("git", ["hash-object", destination], { encoding: "utf8", shell: false });
        if (result.status !== 0 || result.stdout.trim() !== pinnedBlob) {
          throw new Error(`Inherited Hosting file does not match pinned Git blob: ${file}`);
        }
      }
    }
  } finally {
    await rm(archiveRoot, { recursive: true, force: true });
  }
} else {
  await cp(sourcePublic, hostingRoot, {
    recursive: true,
    filter: (candidate) => candidate !== invalidPlaceholder,
  });
}

const webConfig = {
  projectId: release.projectId,
  appId: "1:991554514268:web:d347519f89c22b972a2599",
  storageBucket: "sandman-combat-staging.firebasestorage.app",
  apiKey: "AIzaSyAdUNx3-YYon4GEqGAOaLYK2N-3bfEefZI",
  authDomain: "sandman-combat-staging.firebaseapp.com",
  messagingSenderId: "991554514268",
};
await writeFile(path.join(hostingRoot, "assets/js/runtime-environment.js"),
  `export const runtimeEnvironment = "staging";\nexport const runtimeFirebaseConfig = Object.freeze(${JSON.stringify(webConfig, null, 2)});\n`);
await writeFile(path.join(hostingRoot, "staging-environment.json"),
  `${JSON.stringify({ environment: "staging", projectId: release.projectId, syntheticDataOnly: true }, null, 2)}\n`);

const firebaseInit = await readFile(path.join(hostingRoot, "assets/js/firebase-init.js"), "utf8");
if (!firebaseInit.includes("Staging cannot use the production Firebase project")) {
  throw new Error("Application source lacks the staging Firebase fail-closed guard.");
}

if (release.functions.length) {
  const compiler = path.join(sourceRoot, "functions/node_modules/.bin/tsc");
  const build = spawnSync(compiler, ["-p", path.join(sourceRoot, "functions/tsconfig.json"), "--outDir", path.join(functionsRoot, "lib")], {
    cwd: sourceRoot, env: process.env, stdio: "inherit", shell: false,
  });
  if (build.status !== 0) throw new Error("Failed to compile the immutable application Functions source.");
  // The approved Billing entrypoint does not export a webhook handler. Prevent the
  // shared Stripe client module from registering an unrelated webhook secret during
  // Firebase's endpoint discovery. Only the compiled, staging-only artifact changes.
  if (billingReleaseIds.has(release.releaseId)) {
    const clientPath = path.join(functionsRoot, "lib/billing/stripeClient.js");
    const client = await readFile(clientPath, "utf8");
    const webhookDeclaration = /^exports\.STRIPE_WEBHOOK_SECRET\s*=\s*\(0,\s*params_1\.defineSecret\)\(['"]STRIPE_WEBHOOK_SECRET['"]\);\s*$/gm;
    const matches = [...client.matchAll(webhookDeclaration)];
    if (matches.length !== 1) {
      throw new Error("Expected exactly one compiled webhook secret registration in the isolated Billing staging artifact.");
    }
    const isolated = client.replace(webhookDeclaration, "");
    if (/defineSecret\)\(['"]STRIPE_WEBHOOK_SECRET['"]\)/.test(isolated)) {
      throw new Error("Unexpected remaining webhook secret registration in Billing staging artifact.");
    }
    await writeFile(clientPath, isolated);
  }
  await cp(path.join(sourceRoot, "functions/package-lock.json"), path.join(functionsRoot, "package-lock.json"));
  const packageJson = JSON.parse(await readFile(path.join(sourceRoot, "functions/package.json"), "utf8"));
  packageJson.main = "staging-release-entry.cjs";
  if (["guest-self-checkin-pr280-ef643228", "attendance-admin-init-pr308-0b06a778"].includes(release.releaseId)) delete packageJson.dependencies?.resend;
  // The immutable source was compiled above; Cloud Build must not run tsc again
  // because the deployable artifact intentionally omits tsconfig.json and TS sources.
  packageJson.scripts = { ...(packageJson.scripts || {}), "gcp-build": "" };
  delete packageJson.scripts.build;
  await writeFile(path.join(functionsRoot, "package.json"), `${JSON.stringify(packageJson, null, 2)}\n`);
  const stagingEntryTemplate = await readFile(new URL("./staging-release-entry.cjs", import.meta.url), "utf8");
  let stagingEntry = stagingEntryTemplate.replace("__SANDMAN_STAGING_RUNTIME_SERVICE_ACCOUNT__", release.functionRuntime);
  if (["guest-self-checkin-pr280-ef643228", "attendance-admin-init-pr308-0b06a778"].includes(release.releaseId)) {
    stagingEntry = stagingEntry.replace('module.exports = require("./lib/staging.js");',
      'module.exports = { updatePracticeCheckIn: require("./lib/practice/practiceSessions.js").updatePracticeCheckIn };');
  }
  if (billingReleaseIds.has(release.releaseId)) {
    stagingEntry = stagingEntry.replace('module.exports = require("./lib/staging.js");', `module.exports = {
      recordProposalPrepaidCash: require("./lib/billing/recordProposalPrepaidCash.js").recordProposalPrepaidCash,
      recordProposalPriorPayment: require("./lib/billing/recordProposalPriorPayment.js").recordProposalPriorPayment,
      approveProposalRenewalAutopay: require("./lib/billing/approveProposalRenewalAutopay.js").approveProposalRenewalAutopay,
      createProposalAutopaySetup: require("./lib/billing/proposalAutopaySetup.js").createProposalAutopaySetup,
    };`);
  }
  if (stagingEntry.includes("__SANDMAN_STAGING_RUNTIME_SERVICE_ACCOUNT__")) throw new Error("Staging runtime service-account placeholder was not resolved.");
  await writeFile(path.join(functionsRoot, "staging-release-entry.cjs"), stagingEntry);
  await writeFile(path.join(functionsRoot, `.env.${release.projectId}`), [
    ...Object.entries(release.expectedFunctionConfiguration.environmentVariables).map(([key, value]) => `${key}=${value}`), "",
  ].join("\n"));
  await writeFile(path.join(outputRoot, "firebase.functions.json"), `${JSON.stringify({
    functions: { source: "functions", runtime: "nodejs22", codebase: "default" },
  }, null, 2)}\n`);
}
await writeFile(path.join(outputRoot, "firebase.hosting.json"), `${JSON.stringify({
  hosting: {
    site: release.hostingSite,
    public: hostingRoot,
    cleanUrls: false,
    ignore: ["firebase.json", "**/.*", "**/node_modules/**"],
    rewrites: [{ source: "/xp", function: { functionId: "xpHttp", region: "us-central1" } }],
  },
}, null, 2)}\n`);
await writeFile(path.join(outputRoot, "release-evidence.json"), `${JSON.stringify({
  releaseId,
  applicationSha: release.applicationSha,
  projectId: release.projectId,
  hostingSite: release.hostingSite,
  hosting: release.hosting !== false,
  hostingBaselineSha: release.hostingBaselineSha || null,
  hostingFiles: release.hostingFiles || null,
  functions: release.functions,
  recovery: release.recovery,
  functionDeploymentTool: release.functionDeploymentTool || "firebase-cli",
  bootstrap: release.bootstrap || null,
}, null, 2)}\n`);
console.log(`Prepared immutable staging artifacts for ${releaseId}.`);
