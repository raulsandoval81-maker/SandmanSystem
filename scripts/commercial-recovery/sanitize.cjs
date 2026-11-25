"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { SOURCE, MANIFEST, check, decode, git, hash, loadPlan, scan, sourceInventory } = require("./common.cjs");

function sanitize(source, planFile, output) {
  check(!fs.existsSync(output), "Output already exists.");
  const inventory = sourceInventory(source);
  const sourcePaths = new Map(inventory.map(entry => [entry.path, entry]));
  const plan = loadPlan(planFile, inventory);
  const staging = fs.mkdtempSync(path.join(path.dirname(output), ".commercial-build-"));
  try {
    const repo = path.join(staging, "repository");
    fs.mkdirSync(repo, { mode: 0o700 });
    git(repo, ["init", "--quiet", "--object-format=sha1", "--initial-branch=main"]);
    const index = [];
    const entries = [];
    function write(filename, mode, bytes) {
      const oid = decode(git(repo, ["hash-object", "-w", "--stdin"], bytes)).trim();
      index.push(mode + " " + oid + "\t" + filename + "\0");
    }
    for (const record of plan.records) {
      const original = sourcePaths.get(record.path);
      const entry = { path: record.path, action: record.action, reason: record.reason, sourceOid: original?.oid ?? null };
      if (record.action !== "exclude") {
        const bytes = record.action === "keep"
          ? git(source, ["cat-file", "blob", original.oid])
          : Buffer.from(record.base64, "base64");
        scan(bytes);
        check(hash(bytes) === record.sha256, "Reviewed content digest mismatch.");
        entry.sha256 = record.sha256;
        entry.mode = original?.mode ?? "100644";
        write(record.path, entry.mode, bytes);
      }
      entries.push(entry);
    }
    const manifest = Buffer.from(JSON.stringify({ version: 1, source: SOURCE, planSha256: plan.digest, entries }, null, 2) + "\n");
    write(MANIFEST, "100644", manifest);
    git(repo, ["update-index", "-z", "--index-info"], Buffer.from(index.join("")));
    const tree = decode(git(repo, ["write-tree"])).trim();
    const root = decode(git(repo, ["commit-tree", tree, "-m", "Import sanitized Sandman Commercial"])).trim();
    git(repo, ["update-ref", "refs/heads/main", root]);
    git(repo, ["bundle", "create", path.join(staging, "SandmanCommercial.bundle"), "refs/heads/main"]);
    fs.writeFileSync(path.join(staging, MANIFEST), manifest, { flag: "wx", mode: 0o600 });
    fs.rmSync(repo, { recursive: true });
    fs.renameSync(staging, output);
  } finally {
    fs.rmSync(staging, { recursive: true, force: true });
  }
}

if (require.main === module) {
  try {
    check(process.argv.length === 5, "Usage: node sanitize.cjs SOURCE_REPO REVIEW_PLAN NEW_OUTPUT_DIR");
    sanitize(...process.argv.slice(2).map(value => path.resolve(value)));
    console.log("Candidate bundle created. Independent verification is required.");
  } catch {
    console.error("Commercial candidate creation failed. No path or source contents were logged.");
    process.exitCode = 1;
  }
}
