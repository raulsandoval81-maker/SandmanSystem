import test from "node:test";
import assert from "node:assert/strict";

import {
  resolveVerifiedExperienceYears
} from "../../functions/lib/experienceAuthority.js";

function completed(years, overrides = {}) {
  return {
    assessmentStatus: "completed",
    verifiedExperienceYears: years,
    appointmentCoachUid: "coach-123",
    assessedByCoachUid: "coach-123",
    ...overrides
  };
}

test("incomplete assessment grants zero verified years", () => {
  assert.equal(
    resolveVerifiedExperienceYears({
      assessmentStatus: "pending",
      verifiedExperienceYears: 3,
      appointmentCoachUid: "coach-123",
      assessedByCoachUid: "coach-123"
    }),
    0
  );
});

test("missing assessment grants zero verified years", () => {
  assert.equal(
    resolveVerifiedExperienceYears({}),
    0
  );
});

test("completed Coach verification accepts zero years", () => {
  assert.equal(
    resolveVerifiedExperienceYears(completed(0)),
    0
  );
});

test("completed Coach verification accepts one year", () => {
  assert.equal(
    resolveVerifiedExperienceYears(completed(1)),
    1
  );
});

test("completed Coach verification accepts two years", () => {
  assert.equal(
    resolveVerifiedExperienceYears(completed(2)),
    2
  );
});

test("completed Coach verification accepts three-plus category", () => {
  assert.equal(
    resolveVerifiedExperienceYears(completed(3)),
    3
  );
});

test("completed assessment rejects mismatched Coach signer", () => {
  assert.throws(
    () =>
      resolveVerifiedExperienceYears(
        completed(2, {
          assessedByCoachUid: "different-coach"
        })
      ),
    /does not match the assigned Coach/
  );
});

test("completed assessment rejects missing assigned Coach UID", () => {
  assert.throws(
    () =>
      resolveVerifiedExperienceYears(
        completed(2, {
          appointmentCoachUid: ""
        })
      ),
    /does not match the assigned Coach/
  );
});

test("completed assessment rejects missing assessing Coach UID", () => {
  assert.throws(
    () =>
      resolveVerifiedExperienceYears(
        completed(2, {
          assessedByCoachUid: ""
        })
      ),
    /does not match the assigned Coach/
  );
});

for (const invalidYears of [-1, 4, 99, 1.5, "banana", null]) {
  test(`completed assessment rejects invalid years: ${String(invalidYears)}`, () => {
    assert.throws(
      () =>
        resolveVerifiedExperienceYears(
          completed(invalidYears)
        ),
      /invalid prior-experience value/
    );
  });
}
