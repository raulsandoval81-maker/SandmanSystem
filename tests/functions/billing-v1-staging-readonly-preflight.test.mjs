import test from "node:test";
import assert from "node:assert/strict";
import { summarizeBillingStagingInventory, REQUIRED_SECRETS } from "../../scripts/staging/billing-v1-pr394-readonly-preflight.mjs";

const existing = [{name:"projects/sandman-combat-staging/locations/us-central1/functions/recordProposalPriorPayment", state:"ACTIVE", environment:"GEN_2"}];
const known = {
  STRIPE_SECRET_KEY: { labels: { environment: "staging", stripe_mode: "test" } },
};
test("Staging evidence identifies six absent callables without claiming deployment authorization", () => {
  const result = summarizeBillingStagingInventory(existing, known);
  assert.equal(result.functions.filter(x => x.status === "ACTIVE").length, 1);
  assert.equal(result.functions.filter(x => x.status === "MISSING").length, 6);
  assert.equal(result.readyForDeployment, false);
});
test("Secret inspection reveals labels/status only, never secret values", () => {
  const result = summarizeBillingStagingInventory(existing, known);
  assert.deepEqual(REQUIRED_SECRETS, ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET", "RESEND_API_KEY"]);
  assert.equal(result.secrets.find(x => x.name === "STRIPE_SECRET_KEY").status, "METADATA_PRESENT");
  assert.equal(result.secrets.find(x => x.name === "STRIPE_WEBHOOK_SECRET").status, "MISSING");
  assert.equal(result.secrets.find(x => x.name === "RESEND_API_KEY").status, "MISSING");
  assert.doesNotMatch(JSON.stringify(result), /secretValue|payload|private_key/i);
});
test("Unknown inspection and wrong test-mode labels remain blocked", () => {
  const result = summarizeBillingStagingInventory(existing, {
    STRIPE_SECRET_KEY: { labels: { environment: "production", stripe_mode: "live" } },
    STRIPE_WEBHOOK_SECRET: { error: true },
    RESEND_API_KEY: { labels: {} },
  });
  assert.deepEqual(result.secrets.map(s => s.status), ["LABEL_MISMATCH", "UNKNOWN", "LABEL_MISMATCH"]);
  assert.equal(result.readyForDeployment, false);
});
test("Runtime state and Gen 2 environment must both match", () => {
  const result = summarizeBillingStagingInventory([{ ...existing[0], environment: "GEN_1" }], known);
  assert.equal(result.functions[0].status, "UNVERIFIED");
});
