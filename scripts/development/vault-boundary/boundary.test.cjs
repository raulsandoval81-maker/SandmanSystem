const { createRequire } = require("node:module");
const functionsRequire = createRequire(require.resolve("../../../functions/package.json"));
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const test = require("node:test");
const { vault, inventory } = require("./inventory.cjs");
const { startVaultBoundary } = require("./server.cjs");

test("role boundary protects the complete source without serving static Vault paths", async t => {
  const { server, app, url } = await startVaultBoundary();
  const { deleteApp } = functionsRequire("firebase-admin/app");
  const { getFirestore } = functionsRequire("firebase-admin/firestore");
  const db = getFirestore(app);
  t.after(async () => {
    await new Promise(resolve => server.close(resolve));
    await db.terminate();
    await deleteApp(app);
  });
  async function createIdentity(name, staff) {
    const response = await fetch(`http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: `${name}@example.invalid`, password: "synthetic-demo-only", returnSecureToken: true }),
    });
    const result = await response.json();
    assert.equal(response.status, 200);
    if (staff) await db.doc(`staff/${result.localId}`).set(staff);
    return result;
  }
  const [coach, athlete, management, inactive] = await Promise.all([
    createIdentity("coach", { role: "coach", status: "active" }),
    createIdentity("athlete"),
    createIdentity("management", { role: "management", status: "active" }),
    createIdentity("inactive", { role: "coach", status: "inactive" }),
  ]);
  const source = "strength/segment1/sessions.json";
  const lessonUrl = url + "/coach/vault?source=" + encodeURIComponent(source);
  const signed = ({ idToken }) => ({ headers: { Authorization: "Bearer " + idToken } });
  assert.equal((await fetch(url + "/vault/" + source)).status, 404);
  assert.equal((await fetch(lessonUrl)).status, 401);
  assert.equal((await fetch(lessonUrl, signed({ idToken: "invalid" }))).status, 401);
  for (const identity of [athlete, management, inactive]) {
    assert.equal((await fetch(lessonUrl, signed(identity))).status, 403);
  }
  assert.equal((await fetch(url + "/athlete/vault", signed(athlete))).status, 404);
  assert.equal((await fetch(lessonUrl, { ...signed(coach), method: "POST" })).status, 405);
  assert.equal((await fetch(url + "/coach/vault?source=../firebase.json", signed(coach))).status, 404);
  const listing = await fetch(url + "/coach/vault", signed(coach));
  assert.equal(listing.status, 200);
  const sources = await listing.json();
  assert.equal(sources.length, 37);
  for (const path of sources) {
    const result = await fetch(url + "/coach/vault?source=" + encodeURIComponent(path), signed(coach));
    assert.equal(result.status, 200);
    assert.equal(result.headers.get("Cache-Control"), "private, no-store");
    const raw = readFileSync(join(vault, path), "utf8");
    assert.deepEqual(await result.json(), raw.trim() ? JSON.parse(raw) : null);
  }
  await db.doc(`staff/${coach.localId}`).update({ status: "inactive" });
  assert.equal((await fetch(lessonUrl, signed(coach))).status, 403);
});

test("migration records every source and flags the notes used by athlete readers", () => {
  const sources = inventory();
  assert.equal(sources.length, 37);
  assert.equal(sources.reduce((sum, row) => sum + row.sessions, 0), 599);
  const data = sources.find(row => row.path === "strength/segment1/sessions.json");
  assert.ok(data.fields.some(([path, category]) => path === "sessions.coachNote" && category.startsWith("Ambiguous")));
});
