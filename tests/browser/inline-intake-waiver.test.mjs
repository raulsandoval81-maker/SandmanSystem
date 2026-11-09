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

test("California evening date agrees in both Intake routes and the waiver", async () => {
  const {runInNewContext} = await import("node:vm");
  for (const path of ["public/intake-parent/parent.intake.js",
    "public/intake-athlete/athlete.intake.js", "public/waiver/index.html"]) {
    const helper = read(path).match(/function californiaDateISO\([^]*?\n\s*}/)[0];
    // Extract through the return as the formatter options also contain braces.
    const completeHelper = read(path).slice(read(path).indexOf(helper))
      .match(/function californiaDateISO\([^]*?return [^\n]+\n\s*}/)[0];
    const format = runInNewContext(completeHelper + ";californiaDateISO");
    assert.equal(format(new Date("2026-11-09T07:59:59Z")), "2026-11-08");
    assert.equal(format(new Date("2026-11-09T08:00:00Z")), "2026-11-09");
    assert.equal(format(new Date("2026-07-04T06:59:59Z")), "2026-07-03");
  }
});

for (const [audience, language, embedded] of [
  ["parent_guardian", "es", true],
  ["adult_athlete", "en", true],
  ["adult_athlete", "es", false],
]) {
  test(`${audience} ${language}: waiver persists one signature (${embedded ? "embedded" : "standalone"})`, async () => {
    const {runInNewContext} = await import("node:vm");
    const script = read("public/waiver/index.html").match(/<script>([^]*?)<\/script>/)[1];
    const nodes = new Map();
    const writes = [];
    const messages = [];
    const origin = "https://example.invalid";
    const document = {
      documentElement: {},
      body: {getBoundingClientRect: () => ({height: 1642.5})},
      getElementById(id) {
        if (!nodes.has(id)) nodes.set(id, {value: "", addEventListener(type, callback) { this[type] = callback; }});
        return nodes.get(id);
      },
      querySelectorAll: () => [],
      querySelector: () => null,
    };
    const window = {
      location: {origin, search: `?invite=synthetic&lang=${language}&audience=${audience}&embedded=${Number(embedded)}`},
      setTimeout: callback => callback(),
      close() { this.closed = true; },
    };
    window.parent = embedded ? {postMessage: (...args) => messages.push(args)} : window;
    const fixed = Date.parse("2026-11-09T04:30:00Z");
    class TestDate extends Date { constructor() { super(fixed); } }
    runInNewContext(script, {window, document, URLSearchParams, Date: TestDate,
      localStorage: {getItem: () => null, setItem: (...args) => writes.push(args)},
      ResizeObserver: class { observe() {} },
    });
    const button = nodes.get("waiverAcceptBtn");
    button.click();
    assert.equal(writes.length, 0);
    nodes.get("waiverAgree").checked = true;
    nodes.get("waiverSignature").value = "Synthetic Signer";
    button.click();
    button.click();
    assert.equal(writes.length, 1);
    assert.equal(button.disabled, true);
    assert.deepEqual(JSON.parse(writes[0][1]), {
      invite: "synthetic", audience, language, agreed: true, signatureName: "Synthetic Signer",
      signatureDate: "2026-11-08", acceptedAt: fixed, waiverVersion: "participation-waiver-v1",
    });
    if (embedded) {
      assert.equal(messages[0][0].height, 1643);
      assert.equal(messages[1][0].type, "sandman-waiver-accepted");
      assert.equal(messages[1][1], origin);
    } else {
      assert.equal(window.closed, true);
      assert.equal(messages.length, 0);
    }
  });
}
