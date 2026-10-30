import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const client = fs.readFileSync("public/coaches/execution/clipboard-2.0/clipboard-2.0.js", "utf8");
const server = fs.readFileSync("functions/src/practice/practiceSessions.ts", "utf8");

test("canonical plan request carries session focus and each block note", () => {
  assert.match(client, /planningContext:\s*\{\s*focus: document\.getElementById\("slot-note"\)\?\.value\.trim\(\) \|\| ""/);
  assert.match(client, /plannedBlocks: blocks\.map\(block => \(\{[\s\S]*?minutes: block\.minutes,\s*notes: block\.notes,/);
});
test("server validates bounded focus and notes instead of dropping them", () => {
  assert.match(server, /focus: compactString\(input\.focus, 2000\)/);
  assert.match(server, /notes: compactString\(item\?\.notes, 2000\)/);
  assert.match(server, /JSON\.stringify\(practice\.sessionMemory\?\.plannedBlocks \|\| \[\]\)/);
  assert.match(server, /JSON\.stringify\(practice\.sessionMemory\?\.planningContext \|\| \{\}\)/);
});

test("clean-client note hydration uses canonical practice and does not overwrite drafts", () => {
  assert.match(client, /async function restoreCanonicalPlanNotes\(\)/);
  assert.match(client, /if \(!practiceId \|\| isRecoverableDraft\(storedDraft\)\) return/);
  assert.match(client, /const result = await getPractice\(\{ practiceId \}\)/);
  assert.match(client, /String\(practice\.status \|\| ""\)\.toLowerCase\(\) !== "active"/);
  assert.match(client, /memory\.planningContext\?\.focus/);
  assert.match(client, /document\.getElementById\("notes-" \+ slot\)/);
  assert.match(client, /const originalValues = new Map/);
  assert.match(client, /edited\.has\(field\)/);
  assert.match(client, /field\.value === originalValues\.get\(field\)/);
  assert.match(client, /removeEventListener\("input", onInput\)/);
  assert.match(client, /void restoreCanonicalPlanNotes\(\)/);
});
