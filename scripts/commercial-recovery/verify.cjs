"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { SOURCE, MANIFEST, check, decode, git, hash, loadPlan, scan, sourceInventory, tree } = require("./common.cjs");

function verify(source, planFile, output) {
  const inventory = sourceInventory(source);
  const originals = new Map(inventory.map(entry => [entry.path, entry]));
  const plan = loadPlan(planFile, inventory);
  const review = new Map(plan.records.map(entry => [entry.path, entry]));
  const manifestBytes = fs.readFileSync(path.join(output, MANIFEST));
  const manifest = JSON.parse(decode(manifestBytes));
  check(manifest.version === 1 && manifest.source === SOURCE && manifest.planSha256 === plan.digest &&
    Array.isArray(manifest.entries) && manifest.entries.length === review.size, "Manifest or policy mismatch.");

  const repo = fs.mkdtempSync(path.join(os.tmpdir(), "verify-commercial-"));
  try {
    git(repo, ["init", "--quiet", "--bare", "--object-format=sha1", "--initial-branch=main"]);
    const bundle = path.join(output, "SandmanCommercial.bundle");
    git(repo, ["bundle", "verify", bundle]);
    const head = /^([0-9a-f]{40}) refs\/heads\/main\n$/.exec(decode(git(repo, ["bundle", "list-heads", bundle])));
    check(head, "Bundle must contain exactly one main ref.");
    const root = head[1];
    git(repo, ["bundle", "unbundle", bundle]);
    const rawCommit = decode(git(repo, ["cat-file", "commit", root])).split("\n\n", 1)[0];
    check(/^tree [0-9a-f]{40}\n/.test(rawCommit) && !/^parent /m.test(rawCommit), "Bundle root has parents.");
    git(repo, ["update-ref", "refs/heads/main", root]);
    check(decode(git(repo, ["fsck", "--strict", "--no-reflogs", "--unreachable"])).trim() === "",
      "Bundle contains unreachable objects.");
    const contents = new Map(tree(repo, root).map(entry => [entry.path, entry]));
    const embedded = contents.get(MANIFEST);
    check(embedded?.mode === "100644" && git(repo, ["cat-file", "blob", embedded.oid]).equals(manifestBytes),
      "Embedded manifest differs from supplied manifest.");
    contents.delete(MANIFEST);

    for (const item of manifest.entries) {
      const expected = review.get(item.path);
      const original = originals.get(item.path);
      check(expected && item.action === expected.action && item.reason === expected.reason &&
        item.sourceOid === (original?.oid ?? null), "Unreviewed or duplicated manifest entry.");
      review.delete(item.path);
      const actual = contents.get(item.path);
      if (item.action === "exclude") {
        check(!actual && item.mode === undefined && item.sha256 === undefined, "Excluded file was included.");
        continue;
      }
      const mode = original?.mode ?? "100644";
      check(actual?.mode === mode && actual.type === "blob" && item.mode === mode &&
        item.sha256 === expected.sha256, "Unapproved output or mode.");
      const bytes = git(repo, ["cat-file", "blob", actual.oid]);
      const intended = item.action === "keep"
        ? git(source, ["cat-file", "blob", original.oid])
        : Buffer.from(expected.base64, "base64");
      check(bytes.equals(intended) && hash(bytes) === item.sha256, "Output differs from reviewed bytes.");
      scan(bytes);
      contents.delete(item.path);
    }
    check(review.size === 0 && contents.size === 0, "Unexpected files or missing review entries.");
    console.log(JSON.stringify({ root, manifestSha256: hash(manifestBytes), reviewedPaths: plan.records.length }));
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
}

if (require.main === module) {
  try {
    check(process.argv.length === 5, "Usage: node verify.cjs SOURCE_REPO REVIEW_PLAN OUTPUT_DIR");
    verify(...process.argv.slice(2).map(value => path.resolve(value)));
  } catch {
    console.error("Commercial bundle verification failed. No path or source contents were logged.");
    process.exitCode = 1;
  }
}
