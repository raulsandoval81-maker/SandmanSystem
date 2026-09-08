import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const handouts = ["faq.html", "tournament-guide.html", "weight-hydration.html", "wrestling-101.html", "gear-hygiene.html"];
const root = "public/parent/system/handouts";
const read = (file) => fs.readFileSync(file, "utf8");

test("Wrestling handouts use the shared Parent System child-page contract", () => {
  for (const name of handouts) {
    const html = read(path.join(root, name));
    assert.match(html, /class="parent-system-page"/, name);
    assert.match(html, /\/parent\/parent\.css/, name);
    assert.match(html, /\/parent\/system\/system\.css/, name);
    assert.match(html, /\/assets\/js\/parent-shell\.js/, name);
    assert.match(html, /\/parent\/system\/system-page\.js/, name);
    assert.match(html, /data-parent-system-back[^>]+href="\/parent\/system\//, name);
    assert.match(html, /data-lang="en"/, name);
    assert.match(html, /data-lang="es"/, name);
    assert.match(html, /id="themeToggle"/, name);
    assert.doesNotMatch(html, /history\.back\(|data-lang="sp"|class="sp"|\/system\/assets\//, name);
  }
});

test("shared context helper preserves athlete and discipline without requiring parameters", async () => {
  const { getParentSystemContext } = await import("../../public/parent/system/system-page.js");
  assert.equal(getParentSystemContext("").toString(), "");
  assert.equal(getParentSystemContext("?athlete=f8_0001&discipline=wrestling").toString(), "athlete=F8_0001&discipline=wrestling");
});

test("local stylesheet, script, and Parent System targets exist", () => {
  for (const name of handouts) {
    const html = read(path.join(root, name));
    for (const target of html.matchAll(/(?:href|src)="(\/[^"]+)"/g)) {
      const local = target[1].split(/[?#]/)[0];
      const resolved = local.endsWith("/") ? path.join("public", local, "index.html") : path.join("public", local);
      assert.ok(fs.existsSync(resolved), `${name}: missing ${local}`);
    }
  }
});

test("weight guidance rejects unsafe manipulation and prioritizes wellbeing", () => {
  const html = read(path.join(root, "weight-hydration.html"));
  assert.match(html, /No dehydration or rapid weight loss/);
  assert.match(html, /No restrictive or last-minute weight manipulation/);
  assert.match(html, /wellbeing comes before the scale/);
  assert.doesNotMatch(html, /sweat suit|sauna|water loading|spit cup|skip water/i);
});

test("Lompoc volunteer engine remains intact but is not presented as a general Wrestling resource", () => {
  const volunteer = read(path.join(root, "volunteer.html"));
  const index = read("public/parent/system/index.html");
  assert.match(volunteer, /Lompoc/);
  assert.doesNotMatch(index, /handouts\/volunteer\.html/);
});

