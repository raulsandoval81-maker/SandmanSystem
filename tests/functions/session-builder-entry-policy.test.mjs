import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, "../..");
const policyPath = path.join(repo, "public/coaches/execution/session-builder/session-entry-policy.js");
const policy = await import(pathToFileURL(policyPath));

test("rooms carry explicit canonical location identity", () => {
  assert.deepEqual(policy.roomByValue("lompoc-mat-1"), {
    value: "lompoc-mat-1", roomId: "mat-1", locationId: "lompoc", label: "Lompoc Mat 1"
  });
  assert.equal(policy.roomByValue("solvang-mat-1").locationId, "santa-ynez-valley");
});

test("program availability is filtered by canonical location", () => {
  const santaYnez = policy.programsForLocation("santa-ynez-valley").map((item) => item.programId);
  const lompoc = policy.programsForLocation("lompoc").map((item) => item.programId);
  assert.ok(santaYnez.includes("youth-z2h-wrestling"));
  assert.ok(santaYnez.includes("teen-p2l-wrestling"));
  assert.ok(santaYnez.includes("teen-p2l-boxing"));
  assert.ok(santaYnez.includes("fitness-striking"));
  assert.deepEqual(lompoc, ["manual-build"]);
  assert.equal(santaYnez.includes("adult-q2m-mma"), false);
});

test("Road2Champion Muay Thai is canonical, Santa Ynez-only, and Manual-only", () => {
  const program = policy.programById("youth-z2h-muay-thai");
  assert.equal(program.label, "Road2Champion Muay Thai");
  assert.equal(program.discipline, "muay-thai");
  assert.equal(program.journey, "Z2H");
  assert.equal(program.ageBand, "Youth 7–13");
  assert.deepEqual(program.allowedLocationIds, ["santa-ynez-valley"]);
  assert.equal(program.manual, true);
  assert.equal(program.hybrid, false);
  assert.equal(program.hybridModelPrefix, "");
});

test("attendance context deduplicates athletes and summarizes actual ranks", () => {
  const attendance = {
    checkedIn: [
      { id: "F8_1", name: "One", journey: "Z2H", rank: "Shadow" },
      { uid: "F8_1", name: "Duplicate", rank: "Shadow" },
      { id: "F8_2", name: "Two", tier: "Prospect" },
      { id: "F8_3", name: "Three", rank: "Shadow" }
    ]
  };
  assert.equal(policy.attendanceParticipants(attendance).length, 3);
  assert.deepEqual(policy.attendanceRankSummary(attendance), [
    { label: "Shadow", count: 2 },
    { label: "Prospect", count: 1 }
  ]);
});

test("Auto is not a functional execution mode", () => {
  assert.deepEqual(policy.SESSION_ENTRY_MODES, ["checked-in", "hybrid", "manual", "quick"]);
  assert.throws(
    () => policy.normalizeExecutionMode("auto"),
    /Auto session planning is not available yet/
  );
  const html = fs.readFileSync(path.join(repo, "public/coaches/execution/session-builder/index.html"), "utf8");
  assert.match(html, />Auto</);
  assert.doesNotMatch(html, /data-mode="auto"/);
});

test("Manual, Hybrid, Checked-In, and Quick use the shared Builder and Clipboard spine", () => {
  const builder = fs.readFileSync(path.join(repo, "public/coaches/execution/session-builder/session-builder.js"), "utf8");
  const clipboard = fs.readFileSync(path.join(repo, "public/coaches/execution/clipboard-2.0/clipboard-2.0.js"), "utf8");
  assert.match(builder, /data-mode|selectedMode/);
  assert.match(builder, /openPracticeSession/);
  assert.match(builder, /clipboard-2\.0/);
  assert.doesNotMatch(builder, /daily-clipboard/);
  assert.match(clipboard, /window\.runPractice/);
  assert.match(clipboard, /openPracticeSession/);
});
