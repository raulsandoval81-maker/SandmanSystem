import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";

const require = createRequire(import.meta.url);
const { resolveBillingPublicBaseUrl } =
  require("../../functions/lib/proposals/billingPublicBaseUrl.js");
const read = path => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

test("staging client review and checkout use only the staging origin", () => {
  const stage = { GCLOUD_PROJECT: "sandman-combat-staging" };
  assert.equal(resolveBillingPublicBaseUrl(stage), "https://sandman-combat-staging.web.app");
  assert.equal(resolveBillingPublicBaseUrl({
    FIREBASE_CONFIG: JSON.stringify({ projectId: "sandman-combat-staging" }),
  }), "https://sandman-combat-staging.web.app");
  assert.equal(resolveBillingPublicBaseUrl({
    ...stage,
    SANDMAN_PUBLIC_BASE_URL: "https://sandman-combat-staging.web.app/",
  }), "https://sandman-combat-staging.web.app");
  for (const liveUrl of ["https://sandmancombat.com", "https://www.sandmancombat.com"]) {
    assert.throws(() => resolveBillingPublicBaseUrl({
      ...stage, SANDMAN_PUBLIC_BASE_URL: liveUrl,
    }), /does not match/);
  }
});

test("production client review and checkout use only the approved production origin", () => {
  const production = { GOOGLE_CLOUD_PROJECT: "sandmandashboard" };
  assert.equal(resolveBillingPublicBaseUrl(production), "https://sandmancombat.com");
  assert.equal(resolveBillingPublicBaseUrl({
    ...production, SANDMAN_PUBLIC_BASE_URL: "https://www.sandmancombat.com/",
  }), "https://www.sandmancombat.com");
  assert.throws(() => resolveBillingPublicBaseUrl({
    ...production, SANDMAN_PUBLIC_BASE_URL: "https://sandman-combat-staging.web.app",
  }), /does not match/);
});

test("missing, conflicting or unknown Firebase identities cannot issue billing links", () => {
  assert.throws(() => resolveBillingPublicBaseUrl({}), /verified Firebase project/);
  assert.throws(() => resolveBillingPublicBaseUrl({
    GCLOUD_PROJECT: "sandman-combat-staging", GOOGLE_CLOUD_PROJECT: "sandmandashboard",
  }), /verified Firebase project/);
  assert.throws(() => resolveBillingPublicBaseUrl({
    GCLOUD_PROJECT: "some-other-project",
  }), /not approved/);
  assert.throws(() => resolveBillingPublicBaseUrl({
    FIREBASE_CONFIG: "{bad-json",
  }), /Invalid Firebase/);
});

test("family review and both checkout modes share the guarded URL resolver", () => {
  const review = read("functions/src/proposals/issueProposalClientReview.ts");
  const checkout = read("functions/src/proposals/createProposalCheckout.ts");
  assert.match(review, /sendEmail \? resolveBillingPublicBaseUrl\(\) : ""/);
  assert.match(review, /\$\{reviewBaseUrl\}\$\{reviewPath\}/);
  assert.doesNotMatch(review, /`https:\/\/sandmancombat\.com\$\{reviewPath\}`/);
  assert.equal((checkout.match(/const publicBaseUrl = resolveBillingPublicBaseUrl\(\);/g) || []).length, 2);
  assert.doesNotMatch(checkout, /\|\| "https:\/\/www\.sandmancombat\.com"/);
});
