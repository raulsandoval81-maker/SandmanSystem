import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("staging exports the existing authenticated XP handler", async () => {
  const [staging, handler] = await Promise.all([
    readFile(new URL("../../functions/src/staging.ts", import.meta.url), "utf8"),
    readFile(new URL("../../functions/src/modules/xpHttp.ts", import.meta.url), "utf8"),
  ]);
  assert.match(staging, /export \{ xpHttp \} from "\.\/modules\/xpHttp"/);
  assert.match(handler, /verifyIdToken\(bearer\)/);
  assert.match(handler, /requireActiveStaff/);
  assert.match(handler, /requireCoachAthleteAccessById/);
  assert.match(handler, /dispatchAuthoritativeXp/);
});

test("exact SHA staging Hosting routes same-origin /xp to isolated xpHttp", async () => {
  const [prepare, client, prodConfig] = await Promise.all([
    readFile(new URL("../../scripts/staging/prepare-exact-sha-release.mjs", import.meta.url), "utf8"),
    readFile(new URL("../../public/assets/js/coach-endpoints.js", import.meta.url), "utf8"),
    readFile(new URL("../../firebase.json", import.meta.url), "utf8"),
  ]);
  assert.match(client, /XP_URL\s*=\s*"\/xp"/);
  assert.match(prepare, /source: "\/xp", function: \{ functionId: "xpHttp", region: "us-central1" \}/);
  assert.match(prepare, /site: release\.hostingSite/);
  assert.match(prepare, /projectId: release\.projectId/);
  const config = JSON.parse(prodConfig);
  assert.equal(config.hosting.rewrites.find(x => x.source === "/xp")?.function, "xpHttp");
});

test("staging-only export does not touch production Functions entry", async () => {
  const production = await readFile(new URL("../../functions/src/index.ts", import.meta.url), "utf8");
  assert.match(production, /export \{ xpHttp \} from "\.\/modules\/xpHttp"/);
});
