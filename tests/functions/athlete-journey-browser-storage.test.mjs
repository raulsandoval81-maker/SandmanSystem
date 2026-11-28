import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync("public/assets/js/athlete-journey-routes.js", "utf8");
const { persistVerifiedAthleteId, clearUnverifiedAthleteId } =
  await import("data:text/javascript;base64," + Buffer.from(source).toString("base64"));

function mockStorage() {
  const data = new Map();
  return {
    setItem: (key, value) => data.set(key, String(value)),
    getItem: key => data.has(key) ? data.get(key) : null,
    removeItem: key => data.delete(key),
  };
}

test("verified identity replaces poisoned remembered athlete IDs in both stores", () => {
  globalThis.localStorage = mockStorage();
  globalThis.sessionStorage = mockStorage();
  for (const store of [localStorage, sessionStorage]) {
    store.setItem("sandman_lastAthleteUid", "staging-other-athlete");
    store.setItem("currentAthleteId", "staging-other-athlete");
  }
  persistVerifiedAthleteId("staging-own-athlete");
  for (const store of [localStorage, sessionStorage]) {
    for (const key of ["sandman_lastAthleteUid", "currentAthleteId"]) {
      assert.equal(store.getItem(key), "staging-own-athlete");
    }
  }
});

test("unverified identity clears both keys in both stores", () => {
  globalThis.localStorage = mockStorage();
  globalThis.sessionStorage = mockStorage();
  persistVerifiedAthleteId("staging-own-athlete");
  clearUnverifiedAthleteId();
  for (const store of [localStorage, sessionStorage]) {
    for (const key of ["sandman_lastAthleteUid", "currentAthleteId"]) {
      assert.equal(store.getItem(key), null);
    }
  }
});

test("empty athlete IDs never replace verified storage", () => {
  globalThis.localStorage = mockStorage();
  globalThis.sessionStorage = mockStorage();
  persistVerifiedAthleteId("staging-own-athlete");
  persistVerifiedAthleteId("");
  for (const store of [localStorage, sessionStorage]) {
    assert.equal(store.getItem("sandman_lastAthleteUid"), "staging-own-athlete");
    assert.equal(store.getItem("currentAthleteId"), "staging-own-athlete");
  }
});
