import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

test("historical paid-in-full pricing cannot be mistaken for checkout or verified cash", () => {
  const html = read("public/management/pricing/index.html");
  const js = read("public/management/pricing/pricing.js");
  assert.match(html, /id="historicalPrepaidPricingSummary"/);
  assert.match(html, /Payment status: <strong>Not verified here<\/strong>/);
  assert.match(html, /not a paid receipt or a zero-balance confirmation/);
  assert.match(js, /historicalPrepaid = enrollmentPaymentRoute\?\.value === "historical_prepaid_check"/);
  assert.match(js, /if \(dueRow\) dueRow\.hidden = historicalPrepaid/);
  assert.match(js, /if \(nextRow\) nextRow\.hidden = historicalPrepaid/);
  assert.match(js, /if \(prepaidPreview\) prepaidPreview\.hidden = !historicalPrepaid/);
  assert.match(js, /if \(prepaidValue\) prepaidValue\.textContent = money\(estimate\.monthlyMembership \* 12\)/);
  assert.match(js, /if \(enrollmentExistingLookup\) enrollmentExistingLookup\.hidden = !existing;\s*renderPricing\(\)/);
  assert.match(js, /historicalPrepaid \? null : priorPaymentHandoff\(\)/);
});
