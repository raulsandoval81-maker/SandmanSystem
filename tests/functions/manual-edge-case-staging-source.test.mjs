import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, mkdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createRequire } from "node:module";
import { prepareManualEdgeCaseSource } from "../../scripts/staging/prepare-manual-edge-case-source.mjs";

const require = createRequire(import.meta.url);

test("isolated Manual Edge-Case source exports one callable without loading the Functions index", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "manual-edge-source-"));
  const source = path.join(root, "source");
  const output = path.join(root, "output");
  await mkdir(path.join(source, "lib", "management"), { recursive: true });
  await writeFile(path.join(source, "package.json"), JSON.stringify({
    main: "lib/index.js", scripts: { build: "tsc -p ." }, dependencies: { "firebase-admin": "12.5.0" },
  }));
  await writeFile(path.join(source, "package-lock.json"), "{}\n");
  await writeFile(path.join(source, "lib", "index.js"), "throw Error('unrelated index loaded');\n");
  await writeFile(path.join(source, "lib", "management", "manualEdgeCaseProposal.js"),
    "exports.manualEdgeCaseProposal={__endpoint:{callableTrigger:{}}};\n");

  await prepareManualEdgeCaseSource(source, output);
  const pkg = JSON.parse(await readFile(path.join(output, "package.json"), "utf8"));
  const entry = await readFile(path.join(output, "manual-edge-case-entry.cjs"), "utf8");
  assert.equal(pkg.main, "manual-edge-case-entry.cjs");
  assert.equal(pkg.scripts["gcp-build"], "");
  assert.match(entry, /lib\/management\/manualEdgeCaseProposal\.js/);
  assert.doesNotMatch(entry, /lib\/index\.js|skillCheckCoachCall|STRIPE/);
});

test("failed bootstrap evidence is exact and remains staging-only", () => {
  const release = require("../../scripts/staging/manual-edge-case-release.json");
  assert.equal(release.projectId, "sandman-combat-staging");
  assert.equal(release.failedBootstrap.functionState, "FAILED");
  assert.equal(release.failedBootstrap.buildId, "7f75ed30-a77f-483c-9261-a3988dc779c4");
  assert.equal(release.failedBootstrap.sourceGeneration, "1793574601213241");
  assert.equal(release.failedBootstrap.stateMessageType, "CloudRunServiceNotFound");
  assert.equal(release.productionChanges, false);
  assert.equal(release.iamChanges, false);
});

test("both staging workflows use the isolated source and retain explicit safety gates", async () => {
  for (const file of [
    ".github/workflows/staging-exact-sha-release.yml",
    ".github/workflows/manual-edge-case-staging-bootstrap.yml",
  ]) {
    const workflow = await readFile(file, "utf8");
    assert.match(workflow, /prepare-manual-edge-case-source\.mjs/);
    assert.match(workflow, /--source=\/tmp\/manual-edge-source/);
    assert.match(workflow, /APPROVE_MANUAL_EDGE_CASE_STAGING_CALLABLE/);
    assert.match(workflow, /APPROVE_STAGING_CALLABLE_APPLICATION_AUTH/);
    assert.match(workflow, /sandman-combat-staging/);
    assert.match(workflow, /sandman-billing-runtime@sandman-combat-staging\.iam\.gserviceaccount\.com/);
    assert.match(workflow, /failedBootstrap/);
    assert.match(workflow, /--no-allow-unauthenticated/);
    assert.doesNotMatch(workflow, /--allow-unauthenticated(?:\s|$)/);
  }
});
