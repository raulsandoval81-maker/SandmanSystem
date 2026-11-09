import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL("../../" + path, import.meta.url), "utf8");

for (const [audience, path] of [
  ["parent_guardian", "public/intake-parent/parent.intake.js"],
  ["adult_athlete", "public/intake-athlete/athlete.intake.js"],
]) {
  test(`${audience}: secure Intake embeds the canonical waiver, not a replacement waiver`, () => {
    const src = read(path);
    assert.match(src, /function mountInlineWaiver\(\)/);
    assert.match(src, new RegExp("audience=" + audience + "&lang="));
    assert.match(src, /encodeURIComponent\(currentInviteToken\)/);
    assert.match(src, /frame\.src = "\/waiver\/\?/);
    assert.match(src, /frame\.setAttribute\("loading", "eager"\)/);
    assert.match(src, /event\.origin !== window\.location\.origin/);
    assert.match(src, /event\.source !== frame\.contentWindow/);
    assert.match(src, /applyWaiverAcceptance\(event\.data\.acceptance\)/);
    assert.match(src, /waiverAcceptance\?\.agreed === true/);
    assert.match(src, /waiverAcceptance\?\.signatureName/);
    assert.match(src, /waiverAcceptance\?\.signatureDate/);
  });
}
test("parent Intake waits for validated invite before displaying the inline waiver", () => {
  const src = read("public/intake-parent/parent.intake.js");
  assert.match(src, /if \(inviteReady\) mountInlineWaiver\(\);/);
});
test("adult Intake waits for validated invite before displaying the inline waiver", () => {
  const src = read("public/intake-athlete/athlete.intake.js");
  assert.match(src, /if \(verifiedInvite\) mountInlineWaiver\(\);/);
});
test("embedded waiver posts acceptance only to same-origin verified parent, while standalone route remains", () => {
  const src = read("public/waiver/index.html");
  assert.match(src, /params\.get\('embedded'\) === '1' && window\.parent !== window/);
  assert.match(src, /type: 'sandman-waiver-accepted', acceptance/);
  assert.match(src, /window\.location\.origin/);
  assert.match(src, /localStorage\.setItem/);
  assert.match(src, /window\.close\(\)/);
  assert.match(src, /waiverVersion: 'participation-waiver-v1'/);
});
