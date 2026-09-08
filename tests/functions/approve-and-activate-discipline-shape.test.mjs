import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync(
  "functions/src/approveAndActivate.ts",
  "utf8"
);

test("new athlete activation writes canonical discipline identity", () => {
  assert.match(
    source,
    /primaryDiscipline:\s*initialDiscipline/
  );
  assert.match(
    source,
    /discipline:\s*initialDiscipline/
  );
  assert.match(
    source,
    /disciplineIds:\s*\[initialDiscipline\]/
  );
  assert.match(
    source,
    /activeDiscipline:\s*initialDiscipline/
  );
  assert.match(
    source,
    /disciplines:\s*\{\s*\[initialDiscipline\]:\s*initialDisciplineRecord/
  );
});

test("initial nested discipline record reuses canonical builder", () => {
  assert.match(
    source,
    /const initialDisciplineRecord = \{\s*\.\.\.buildDisciplineRecord/
  );
  assert.match(
    source,
    /discipline:\s*initialDiscipline/
  );
});

test("initial discipline progression mirrors activation starting state", () => {
  assert.match(
    source,
    /const initialDisciplineRecord = \{[\s\S]*?xp:\s*startingXp,[\s\S]*?stripeCount/
  );
});
