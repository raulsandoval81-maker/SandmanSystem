import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

const source = readFileSync(new URL("../../public/intake-management/review.js", import.meta.url), "utf8");
const start = source.indexOf("function preventDoubleTap(btn, fn) {");
const end = source.indexOf("\nconst authReady =", start);
assert.ok(start >= 0 && end > start, "retry guard exists");
const preventDoubleTap = runInNewContext(source.slice(start, end) + "\npreventDoubleTap");

function button() {
  const attributes = new Set();
  const classes = new Set();
  return {
    disabled: false,
    attributes,
    classes,
    setAttribute(key) { attributes.add(key); },
    removeAttribute(key) { attributes.delete(key); },
    classList: { add(key) { classes.add(key); }, remove(key) { classes.delete(key); } },
  };
}

for (const [name, result] of [["cancelled", false], ["validation blocked", false]]) {
  test(name + " allows another activation attempt", async () => {
    const btn = button();
    let calls = 0;
    const click = preventDoubleTap(btn, async () => { calls++; return result; });
    await click({ preventDefault() {} });
    assert.equal(btn.disabled, false);
    assert.equal(btn.attributes.has("aria-busy"), false);
    assert.equal(btn.classes.has("is-busy"), false);
    await click({ preventDefault() {} });
    assert.equal(calls, 2);
  });
}

test("server rejection allows retry", async () => {
  const btn = button();
  let calls = 0;
  const click = preventDoubleTap(btn, async () => {
    calls++;
    if (calls === 1) throw Error("unreconciled");
  });
  await assert.rejects(click({ preventDefault() {} }), /unreconciled/);
  assert.equal(btn.disabled, false);
  await click({ preventDefault() {} });
  assert.equal(calls, 2);
});

test("successful activation remains locked against duplicate clicks", async () => {
  const btn = button();
  let calls = 0;
  const click = preventDoubleTap(btn, async () => { calls++; });
  await click({ preventDefault() {} });
  await click({ preventDefault() {} });
  assert.equal(calls, 1);
  assert.equal(btn.disabled, true);
});
