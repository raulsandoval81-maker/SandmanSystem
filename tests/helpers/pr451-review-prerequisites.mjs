import assert from "node:assert/strict";
import { manifest, invocationState } from
  "../../scripts/staging/pr451-intake-activation-release.mjs";

// These are read-only prerequisites, never additional bootstrap deploy targets.
export function verifyReviewPrerequisites(records) {
  assert.deepEqual(manifest.requiredReviewCallables, [
    { name: "submitProposalForReview", kind: "gen2-callable" },
    { name: "issueProposalClientReview", kind: "gen2-callable" },
  ]);
  for (const entry of manifest.requiredReviewCallables) {
    assert.ok(manifest.requiredExistingFunctions.includes(entry.name));
    assert.ok(!manifest.functions.some(item => item.name === entry.name));
    const value = records[entry.name]?.description;
    assert.ok(value && !value.absent, `Missing review prerequisite: ${entry.name}`);
    assert.equal(value.name,
      `projects/${manifest.projectId}/locations/${manifest.region}/functions/${entry.name}`);
    assert.equal(value.state, "ACTIVE", `${entry.name} is not ACTIVE`);
    assert.equal(value.environment, "GEN_2");
    assert.equal(value.buildConfig?.runtime, "nodejs22");
    assert.equal(value.buildConfig?.entryPoint, entry.name);
    assert.equal(invocationState(entry, records[entry.name].invocation), "complete",
      `Review prerequisite invocation incomplete: ${entry.name}`);
  }
  return true;
}
