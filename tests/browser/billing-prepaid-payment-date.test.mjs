import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("prepaid cash/check form requires the original payment date", async () => {
  const source = await readFile("public/management/billing/billing.js", "utf8");
  const open = source.match(/function openCashDialog\([\s\S]*?(?=\nfunction |\nexport |$)/)?.[0];
  assert.ok(open, "prepaid cash dialog initializer exists");
  assert.match(open, /getElementById\("prepaidCashPaymentDate"\)\.value\s*=\s*"";/);
  assert.doesNotMatch(open, /getElementById\("prepaidCashPaymentDate"\)\.value\s*=\s*today;/);
  assert.match(source, /id="prepaidCashPaymentDate"[\s\S]*?type="date"[\s\S]*?required/);
  assert.match(source, /!paymentDate/, "submission validates supplied payment date");
});
