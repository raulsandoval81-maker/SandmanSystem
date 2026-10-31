import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const html = readFileSync(new URL("../../public/management/pricing/index.html", import.meta.url), "utf8");
const js = readFileSync(new URL("../../public/management/pricing/pricing.js", import.meta.url), "utf8");

test("enrollment entry follows Pricing Mode and precedes family membership", () => {
  const mode = html.indexOf('id="pricingMode"');
  const entry = html.indexOf('id="enrollmentEntryPanel"');
  const family = html.indexOf('id="athletesHeading"');
  assert.ok(mode >= 0 && entry > mode && family > entry);
  for (const id of ["enrollmentEntrySource", "enrollmentRegistrantRole", "enrollmentAthleteRecord", "enrollmentEntryStatus"]) {
    assert.ok(html.includes(`id="${id}"`), `Missing ${id}`);
  }
});

test("options distinguish entry origin, registrant and athlete record", () => {
  for (const v of ['value="admissions"', 'value="walk_in"', 'value="parent_guardian"', 'value="athlete"', 'value="new"', 'value="existing"']) {
    assert.ok(html.includes(v), `Missing option ${v}`);
  }
});

test("only canonical appointment-backed new-athlete path can continue", () => {
  assert.match(js, /source === "admissions" && !existing && Boolean\(sourceAppointment && appointmentId\)/);
  assert.match(js, /enrollmentEntrySource\?\.value !== "admissions"/);
  assert.match(js, /enrollmentAthleteRecord\?\.value !== "new"/);
  assert.match(js, /continueProposalBtn\.hidden = !supported/);
  assert.match(html, /id="enrollmentExistingAthleteSearch"[\s\S]*?disabled>/);
});

test("linked admissions registrant cannot be changed in pricing-only UI", () => {
  assert.match(js, /enrollmentRegistrantRole\.disabled = true/);
  assert.match(js, /registrant === "adult-athlete"/);
});
