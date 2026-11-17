"use strict";

const { createHash } = require("node:crypto");
const { spawnSync } = require("node:child_process");
const { TextDecoder } = require("node:util");

const SOURCE = "623f560f36dd84ef33b6270c3a1d414fbcb488bb";
const MANIFEST = "COMMERCIAL_IMPORT_MANIFEST.json";
const HASH = /^[0-9a-f]{64}$/;
const PRESERVE = [
  "functions/src/modules/promotion/promoteTierAction.ts",
  "functions/src/modules/passAthleteTest.ts",
];
const REQUIRED_REPLACEMENTS = [
  "functions/src/index.ts",
  "functions/src/modules/incrementXp.ts",
  "functions/src/billing/stripeClient.ts",
  "functions/src/modules/email/resend.ts",
  "public/assets/js/firebase-init.js",
  "public/assets/js/firebase-init-para.js",
];
const decoder = new TextDecoder("utf-8", { fatal: true });

function check(ok, message) {
  if (!ok) throw new Error(message);
}

function decode(bytes) {
  return decoder.decode(bytes);
}

function hash(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function git(repo, args, input) {
  const result = spawnSync("git", [
    "--no-replace-objects", "-c", "core.hooksPath=/dev/null",
    "-c", "core.fsmonitor=false", "-c", "protocol.file.allow=never",
    "-c", "protocol.ext.allow=never", "-C", repo, ...args,
  ], {
    input,
    env: {
      PATH: process.env.PATH, LC_ALL: "C", GIT_CONFIG_NOSYSTEM: "1",
      GIT_CONFIG_GLOBAL: "/dev/null", GIT_TERMINAL_PROMPT: "0",
      GIT_NO_LAZY_FETCH: "1",
      GIT_AUTHOR_NAME: "Sandman Commercial Import",
      GIT_AUTHOR_EMAIL: "import@sandman-commercial.invalid",
      GIT_COMMITTER_NAME: "Sandman Commercial Import",
      GIT_COMMITTER_EMAIL: "import@sandman-commercial.invalid",
    },
    maxBuffer: 128 * 1024 * 1024,
  });
  check(result.status === 0, "Git operation failed: " + args[0]);
  return result.stdout;
}

function validPath(path) {
  return typeof path === "string" && path.length <= 512 &&
    path.split("/").every(part => /^[A-Za-z0-9._ @+(),&'!-]+$/.test(part) &&
      !part.startsWith("-") && !part.endsWith(".") && !part.endsWith(" ") &&
      part !== "." && part !== ".." && part.toLowerCase() !== ".git");
}

function prohibitedPath(path) {
  if (path === "firebase.commercial-emulator.json") return false;
  return /(?:^|\/)(?:\.github|\.gitmodules|\.firebaserc|\.env(?:\..*)?|node_modules|firebase-debug[^/]*|emulator-data|private|archive|credentials?|secrets?)(?:\/|$)/i.test(path) ||
    /^(?:functions\/lib\/|functions\/scripts\/|scripts\/(?:production|staging|stripe|f8-migration|parent-links)\/|public\/scripts\/)/i.test(path) ||
    /(?:^|\/)firebase(?:\.[^/]+)?\.json$|\.(?:pem|p12|key|csv|zip|bundle|log|sql)$/i.test(path);
}

function scan(bytes) {
  const text = bytes.toString("latin1");
  check(!/sandmandashboard|sandman-combat-staging|sandman-main|sandmancombat\.com|metadata\.google\.internal|P-000019|correctP000019|private_key_id|AIza[A-Za-z0-9_-]{35}|(?:sk|rk|pk)_(?:live|test)_[A-Za-z0-9]{16,}|whsec_[A-Za-z0-9]{16,}|-----BEGIN [A-Z ]*PRIVATE KEY-----|gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,}|AKIA[A-Z0-9]{16}/i.test(text),
    "Forbidden Academy endpoint, record identifier or credential marker.");
}

function tree(repo, ref) {
  const raw = decode(git(repo, ["ls-tree", "-r", "-z", ref]));
  check(raw.endsWith("\0"), "Empty or invalid tree.");
  const rows = raw.slice(0, -1).split("\0");
  const entries = rows.map(row => {
    const match = /^([0-7]{6}) (blob|commit) ([0-9a-f]{40})\t([^\0]+)$/.exec(row);
    check(match, "Invalid tree entry.");
    return { mode: match[1], type: match[2], oid: match[3], path: match[4] };
  });
  check(new Set(entries.map(entry => entry.path)).size === entries.length, "Duplicate tree path.");
  return entries;
}

function validatePlan(plan, inventory) {
  check(plan.version === 1 && plan.source === SOURCE && Array.isArray(plan.entries), "Invalid review plan.");
  const inputs = new Map(inventory.map(entry => [entry.path, entry]));
  const paths = new Set();
  const outputs = new Set();
  for (const record of plan.entries) {
    check(record && typeof record.path === "string" && !paths.has(record.path) &&
      ["keep", "replace", "exclude", "add"].includes(record.action) &&
      /^[a-z][a-z0-9_-]{2,63}$/.test(record.reason), "Invalid or duplicate review entry.");
    paths.add(record.path);
    const source = inputs.get(record.path);
    check(record.action === "add" ? !source && record.oid === undefined : Boolean(source) && source.oid === record.oid,
      "Review does not match a pinned Git object.");
    if (record.action === "exclude") continue;
    check(validPath(record.path) && !prohibitedPath(record.path) &&
      record.path.toLowerCase() !== MANIFEST.toLowerCase() &&
      !outputs.has(record.path.toLowerCase()) && HASH.test(record.sha256), "Unsafe or unpinned output path.");
    outputs.add(record.path.toLowerCase());
    check(!source || (source.type === "blob" && ["100644", "100755"].includes(source.mode)),
      "Unsupported source mode for retained path.");
    if (record.action === "keep") {
      check(record.base64 === undefined, "Keep requires original bytes.");
    } else {
      check(typeof record.base64 === "string" &&
        Buffer.from(record.base64, "base64").toString("base64") === record.base64,
      "Replacement requires canonical base64 bytes.");
    }
  }
  check([...inputs.keys()].every(path => paths.has(path)), "Incomplete pinned path review.");
  for (const path of outputs) {
    const parts = path.split("/");
    while (parts.length > 1) {
      parts.pop();
      check(!outputs.has(parts.join("/")), "Overlapping output paths.");
    }
  }
  return plan.entries;
}

function loadPlan(file, inventory) {
  const bytes = require("node:fs").readFileSync(file);
  const records = validatePlan(JSON.parse(decode(bytes)), inventory);
  const reviewed = new Map(records.map(record => [record.path, record.action]));
  check(PRESERVE.every(path => reviewed.get(path) === "keep"), "Progression implementation must be retained byte-for-byte.");
  check(REQUIRED_REPLACEMENTS.every(path => reviewed.get(path) === "replace"), "Reviewed Firebase and provider isolation overlays are required.");
  const demo = records.find(record => record.path === "firebase.commercial-emulator.json");
  check(demo?.action === "add", "Independent demo configuration is required.");
  const config = JSON.parse(decode(Buffer.from(demo.base64, "base64")));
  for (const name of ["auth", "firestore", "functions", "hosting", "storage"]) {
    const emulator = config.emulators?.[name];
    check(emulator?.host === "127.0.0.1" && Number.isInteger(emulator.port) &&
      emulator.port >= 1024 && emulator.port <= 65535, "Emulators must use explicit loopback addresses.");
  }
  return { records, digest: hash(bytes) };
}

function sourceInventory(repo) {
  check(decode(git(repo, ["rev-parse", SOURCE + "^{commit}"])).trim() === SOURCE, "Pinned source absent.");
  return tree(repo, SOURCE);
}

module.exports = { SOURCE, MANIFEST, check, decode, git, hash, loadPlan, scan, sourceInventory, tree, validPath, prohibitedPath, validatePlan };
