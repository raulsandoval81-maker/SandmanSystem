#!/usr/bin/env node
// Source-only preflight for PR505. Never authenticates, deploys, reads secrets,
// sends email, invokes callable functions, or modifies Firestore/Hosting.
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const cp = require("node:child_process");

const manifest = require("./pr505-2c-readonly-plan.json");
const sourceRoot = path.resolve(process.argv[2] || ".");
const git = (...args) => cp.execFileSync("git", ["-C", sourceRoot, ...args], {encoding:"utf8"}).trim();
function check(value, reason) {if (!value) throw Error("2C SOURCE PREFLIGHT BLOCKED: " + reason);}
function file(p) {return fs.readFileSync(path.join(sourceRoot,p),"utf8");}
const expectedFiles = [
  ".github/workflows/2c-cash-check-draft-tests.yml",
  "functions/src/billing/sendProposalPrepaidCashReceipt.ts",
  "functions/src/enrollment/sendEnrollmentIntakeEmail.ts",
  "functions/src/index.ts",
  "functions/src/proposals/issueProposalEnrollmentHandoff.ts",
  "functions/tests/prepaidCashReceipt.integration.cjs",
  "public/connect/admissions/calculator/calculator.js",
  "public/connect/admissions/calculator/index.html",
  "public/connect/proposals/proposals.js",
  "public/intake-management/management.intake.js",
  "public/management/billing/billing.js"
].sort();
const hosting = [
 "/connect/admissions/calculator/calculator.js",
 "/connect/admissions/calculator/index.html",
 "/connect/proposals/proposals.js",
 "/intake-management/management.intake.js",
 "/management/billing/billing.js"
].sort();
check(manifest.repository === "raulsandoval81-maker/SandmanSystem" &&
  manifest.projectId === "sandman-combat-staging" &&
  manifest.hostingSite === "sandman-combat-staging" &&
  manifest.region === "us-central1", "staging identity mismatch");
check(manifest.applicationSha === "d2a9fcce0e820c31270bb689b40fabbdf9832a07" &&
  manifest.reviewedBaseSha === "b13dba939b2e95fee22f448df72acf8bfca76f2f", "source pin drift");
check(git("rev-parse","HEAD") === manifest.applicationSha, "wrong immutable source checkout");
const actual = git("diff","--name-only",manifest.reviewedBaseSha,manifest.applicationSha).split("\n").filter(Boolean).sort();
check(JSON.stringify(actual)===JSON.stringify(expectedFiles), "changed source files do not match exact 11-file scope");
check(JSON.stringify([...manifest.changedFiles].sort())===JSON.stringify(expectedFiles), "manifest source scope drift");
check(JSON.stringify([...manifest.hostingAssets].sort())===JSON.stringify(hosting), "five-asset Hosting scope drift");
check(manifest.functions.length===3 &&
  manifest.functions[0].name==="sendProposalPrepaidCashReceipt" &&
  manifest.functions[0].action==="create" &&
  manifest.functions[1].name==="sendEnrollmentIntakeEmail" &&
  manifest.functions[1].action==="update" &&
  manifest.functions[2].name==="issueProposalEnrollmentHandoff" &&
  manifest.functions[2].action==="update", "Function allowlist drift");
check(manifest.deploymentAuthorized===false &&
  manifest.productionAuthorized===false &&
  manifest.firestoreWritesAuthorized===false &&
  manifest.hostingWritesAuthorized===false &&
  manifest.iamChangesAuthorized===false &&
  manifest.secretReadsAuthorized===false &&
  manifest.stripeOperationsAuthorized===false &&
  manifest.sendEmailsAuthorized===false, "unapproved side effects in manifest");
check(/sendProposalPrepaidCashReceipt/.test(file("functions/src/index.ts")), "new receipt export missing");
check(/twoCRecovery/.test(file("functions/src/enrollment/sendEnrollmentIntakeEmail.ts")) &&
  /receipt\.status/.test(file("functions/src/enrollment/sendEnrollmentIntakeEmail.ts")), "2C Intake safeguards absent");
check(/mode === "confirm_sent"/.test(file("functions/src/billing/sendProposalPrepaidCashReceipt.ts")), "receipt recovery absent");
check(/data-ready-2c/.test(file("public/intake-management/management.intake.js")), "combined 2C action missing");
check(manifest.requiredLiveReadOnlyEvidence.length>=5, "current cloud baseline not specified");
console.log(JSON.stringify({
  status:"PR505_SOURCE_SCOPE_VERIFIED_NO_DEPLOY",
  sha:manifest.applicationSha, functions:manifest.functions.map(f=>f.name),
  assets:manifest.hostingAssets, sourceFiles:actual.length,
  liveBaselineVerified:false, deploymentAuthorized:false
},null,2));
