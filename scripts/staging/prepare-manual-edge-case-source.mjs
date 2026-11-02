#!/usr/bin/env node
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

export async function prepareManualEdgeCaseSource(sourceRoot, outputRoot) {
  const source = path.resolve(sourceRoot);
  const output = path.resolve(outputRoot);
  if (source === output || output === path.parse(output).root) {
    throw new Error("Manual Edge-Case release output must be a separate, non-root directory.");
  }

  const packageJson = JSON.parse(await readFile(path.join(source, "package.json"), "utf8"));
  await rm(output, { recursive: true, force: true });
  await mkdir(output, { recursive: true });
  await cp(path.join(source, "lib"), path.join(output, "lib"), { recursive: true });
  await cp(path.join(source, "package-lock.json"), path.join(output, "package-lock.json"));

  packageJson.main = "manual-edge-case-entry.cjs";
  packageJson.scripts = { ...(packageJson.scripts || {}), "gcp-build": "" };
  await writeFile(path.join(output, "package.json"), `${JSON.stringify(packageJson, null, 2)}\n`);
  await writeFile(path.join(output, "manual-edge-case-entry.cjs"), `"use strict";
const admin = require("firebase-admin");
if (!admin.apps.length) admin.initializeApp();
const { manualEdgeCaseProposal } = require("./lib/management/manualEdgeCaseProposal.js");
module.exports = { manualEdgeCaseProposal };
`);

  return { output, entryPoint: "manualEdgeCaseProposal" };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  if (process.argv.length !== 4) {
    throw new Error("Usage: prepare-manual-edge-case-source.mjs <compiled-functions-root> <output-root>");
  }
  const result = await prepareManualEdgeCaseSource(process.argv[2], process.argv[3]);
  console.log(`Prepared isolated ${result.entryPoint} source at ${result.output}`);
}
