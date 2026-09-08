import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const names = ["faq.html", "muay-thai-101.html", "event-guide.html", "gear-hygiene.html", "family-guidance.html"];
const root = "public/parent/system/handouts/muay-thai";
const read = (file) => fs.readFileSync(file, "utf8");

test("Muay Thai package contains five shared-shell bilingual child pages", () => {
  for (const name of names) {
    const html = read(path.join(root, name));
    assert.match(html, /class="parent-system-page"/, name);
    assert.match(html, /\/parent\/parent\.css/, name);
    assert.match(html, /\/parent\/system\/system\.css/, name);
    assert.match(html, /\/assets\/js\/parent-shell\.js/, name);
    assert.match(html, /\/parent\/system\/system-page\.js/, name);
    assert.match(html, /data-parent-system-back[^>]+href="\/parent\/system\//, name);
    assert.match(html, /data-lang="en"/, name);
    assert.match(html, /data-lang="es"/, name);
    assert.doesNotMatch(html, /history\.back\(|data-lang="sp"|class="sp"|Lompoc|Wrestling|Boxing/, name);
  }
});

test("Muay Thai cards are fail-closed and discipline packages remain separate", () => {
  const html = read("public/parent/system/index.html");
  for (const name of names) {
    assert.match(html, new RegExp(`data-parent-discipline="muay-thai"[^>]+handouts/muay-thai/${name.replace(".", "\\.")}[^>]+hidden`));
  }
  assert.equal((html.match(/data-parent-discipline="muay-thai"/g) || []).length, 5);
  assert.equal((html.match(/data-parent-discipline="boxing"/g) || []).length, 5);
  assert.equal((html.match(/data-parent-discipline="wrestling"/g) || []).length, 5);
  assert.match(html, /href="\/parent\/system\/handouts\/how-the-system-works\.html"/);
  const source = read("public/parent/system/system-context.js");
  assert.match(source, /item\.hidden = item\.dataset\.parentDiscipline !== selectedContext\.activeDiscipline/);
});

test("multi-discipline context isolates Muay Thai, Boxing, and Wrestling", async () => {
  const { resolveParentAthleteContext } = await import("../../public/assets/js/parent-athlete-context.js");
  const athlete = { id: "F4_0001", disciplineIds: ["wrestling", "boxing", "muay-thai"], activeDiscipline: "wrestling" };
  for (const discipline of ["wrestling", "boxing", "muay-thai"]) {
    assert.equal(resolveParentAthleteContext(athlete, { requestedDiscipline: discipline }).activeDiscipline, discipline);
  }
  const cards = [...read("public/parent/system/index.html").matchAll(/data-parent-discipline="([^"]+)"/g)].map((match) => match[1]);
  assert.equal(cards.filter((discipline) => discipline === "muay-thai").length, 5);
});

test("Muay Thai page local assets and links resolve and direct URLs need no context", () => {
  for (const name of names) {
    const html = read(path.join(root, name));
    for (const match of html.matchAll(/(?:href|src)="(\/[^"]+)"/g)) {
      const local = match[1].split(/[?#]/)[0];
      const resolved = local.endsWith("/") ? path.join("public", local, "index.html") : path.join("public", local);
      assert.ok(fs.existsSync(resolved), `${name}: missing ${local}`);
    }
    assert.doesNotMatch(html, /URLSearchParams|athlete=|discipline=/, name);
  }
});

test("Muay Thai guidance keeps contact supervised and weight guidance safe", () => {
  const all = names.map((name) => read(path.join(root, name))).join("\n");
  assert.match(all, /Sparring is coach-controlled/);
  assert.match(all, /Clinch, contact work, and sparring are taught progressively under supervision/);
  assert.match(all, /do not use unsafe weight manipulation/i);
  assert.doesNotMatch(all, /unsupervised sparring|sauna|sweat suit|skip water|dehydrate to|hard spar on your own/i);
});
