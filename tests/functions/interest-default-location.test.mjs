import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

const html = readFileSync(new URL("../../public/connect/interest/index.html", import.meta.url), "utf8");
const mark = "<!-- Resolve the headquarters interest entry";
const start = html.indexOf(mark);
assert.ok(start !== -1, "Expected location-bootstrap marker");
const script = html.slice(start).match(/<script>([\s\S]*?)<\/script>/)?.[1];
assert.ok(script, "Expected early location-bootstrap script");

function visit(input) {
  let current = new URL(input);
  const redirects = [];
  let replaceCount = 0;
  const win = {
    location: {
      get href() { return current.href; },
      replace(path) { redirects.push(path); },
    },
    history: {
      state: { test: true },
      replaceState(_state, _title, next) {
        replaceCount++;
        current = new URL(next);
      },
    },
  };
  runInNewContext(script, { URL, window: win });
  return { current, redirects, replaceCount };
}

test("generic interest entry automatically resolves Santa Ynez without family input", () => {
  const r = visit("https://sandman-combat-staging.web.app/connect/interest/?lang=es&source=flyer");
  assert.equal(r.current.searchParams.get("location"), "santa-ynez-valley");
  assert.equal(r.current.searchParams.get("lang"), "es");
  assert.equal(r.current.searchParams.get("source"), "flyer");
  assert.equal(r.replaceCount, 1);
  assert.deepEqual(r.redirects, []);
});

test("explicit local location is preserved and not overwritten", () => {
  const r = visit("https://sandman-combat-staging.web.app/connect/interest/?location=lompoc");
  assert.equal(r.current.searchParams.get("location"), "lompoc");
  assert.equal(r.replaceCount, 0);
});

test("paused Elk Grove entry retains existing redirect", () => {
  const r = visit("https://sandman-combat-staging.web.app/connect/interest/?location=elk-grove");
  assert.deepEqual(r.redirects, ["/locations/"]);
  assert.equal(r.replaceCount, 0);
});

test("unknown or empty explicit location is not silently converted to headquarters", () => {
  for (const location of ["unknown-site", ""]) {
    const r = visit("https://sandman-combat-staging.web.app/connect/interest/?location=" + location);
    assert.equal(r.current.searchParams.get("location"), location);
    assert.equal(r.replaceCount, 0);
  }
});

test("explicit future academy routing is never rewritten", () => {
  for (const key of ["academy", "academyId", "site"]) {
    const r = visit("https://sandman-combat-staging.web.app/connect/interest/?" + key + "=yesc");
    assert.equal(r.current.searchParams.get("location"), null);
    assert.equal(r.replaceCount, 0);
  }
});
