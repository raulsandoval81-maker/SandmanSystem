const assert = require("node:assert/strict");
const test = require("node:test");

const {
  STAGING_PROJECT_ID,
  STAGING_WRESTLING_RUNTIME_SERVICE_ACCOUNT,
  resolveSkillCheckRuntimeOptions,
} = require("../lib/config/functionRuntime");

test("production and local discovery preserve the existing default runtime identity", () => {
  assert.deepEqual(resolveSkillCheckRuntimeOptions({}), {});
  assert.deepEqual(resolveSkillCheckRuntimeOptions({GCLOUD_PROJECT: "sandmandashboard"}), {});
});

test("approved staging discovery binds the dedicated Wrestling runtime", () => {
  assert.deepEqual(resolveSkillCheckRuntimeOptions({
    SANDMAN_STAGING_PROJECT_ID: STAGING_PROJECT_ID,
    SANDMAN_STAGING_ACK: STAGING_PROJECT_ID,
    SANDMAN_WRESTLING_RUNTIME_SERVICE_ACCOUNT: STAGING_WRESTLING_RUNTIME_SERVICE_ACCOUNT,
  }), {serviceAccount: STAGING_WRESTLING_RUNTIME_SERVICE_ACCOUNT});
});

test("runtime override fails closed outside the exact staging boundary", () => {
  const valid = {
    SANDMAN_STAGING_PROJECT_ID: STAGING_PROJECT_ID,
    SANDMAN_STAGING_ACK: STAGING_PROJECT_ID,
    SANDMAN_WRESTLING_RUNTIME_SERVICE_ACCOUNT: STAGING_WRESTLING_RUNTIME_SERVICE_ACCOUNT,
  };
  assert.throws(() => resolveSkillCheckRuntimeOptions({...valid, SANDMAN_STAGING_PROJECT_ID: "sandmandashboard"}), /only for the approved staging project/);
  assert.throws(() => resolveSkillCheckRuntimeOptions({...valid, SANDMAN_STAGING_ACK: "sandmandashboard"}), /only for the approved staging project/);
  assert.throws(() => resolveSkillCheckRuntimeOptions({...valid, SANDMAN_WRESTLING_RUNTIME_SERVICE_ACCOUNT: "wrong@example.invalid"}), /approved staging Wrestling runtime/);
  assert.throws(() => resolveSkillCheckRuntimeOptions({SANDMAN_WRESTLING_RUNTIME_SERVICE_ACCOUNT: STAGING_WRESTLING_RUNTIME_SERVICE_ACCOUNT}), /only for the approved staging project/);
});
