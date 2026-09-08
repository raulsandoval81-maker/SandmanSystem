import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = "public/parent/system";
const read = (file) => fs.readFileSync(file, "utf8");
const activePages = [
  "progression.html",
  "xp.html",
  "ceremonies.html",
  "fitness-self-defense/index.html",
  "handouts/how-the-system-works.html",
  "handouts/policy.html",
  "handouts/faq.html",
  "handouts/tournament-guide.html",
  "handouts/weight-hydration.html",
  "handouts/wrestling-101.html",
  "handouts/gear-hygiene.html",
  ...["faq.html", "boxing-101.html", "event-guide.html", "gear-hygiene.html", "family-guidance.html"]
    .map((file) => `handouts/boxing/${file}`),
  ...["faq.html", "muay-thai-101.html", "event-guide.html", "gear-hygiene.html", "family-guidance.html"]
    .map((file) => `handouts/muay-thai/${file}`)
];

test("active Parent knowledge packages are exactly Wrestling, Boxing, and Muay Thai", () => {
  const html = read(path.join(root, "index.html"));
  const disciplines = [...html.matchAll(/data-parent-discipline="([^"]+)"/g)].map((match) => match[1]);
  assert.deepEqual([...new Set(disciplines)].sort(), ["boxing", "muay-thai", "wrestling"]);
  assert.equal(disciplines.filter((value) => value === "wrestling").length, 5);
  assert.equal(disciplines.filter((value) => value === "boxing").length, 5);
  assert.equal(disciplines.filter((value) => value === "muay-thai").length, 5);
  assert.doesNotMatch(html, /data-parent-discipline="(?:mma|submission-grappling|bjj|grappling|kickboxing)"/i);
});

test("discipline package visibility is fail-closed and switching repaints every card", () => {
  const source = read(path.join(root, "system-context.js"));
  assert.match(source, /ACTIVE_PARENT_SYSTEM_DISCIPLINES = Object\.freeze\(\["wrestling", "boxing", "muay-thai"\]\)/);
  assert.match(source, /context\.disciplineIds\.filter/);
  assert.match(source, /ACTIVE_PARENT_SYSTEM_DISCIPLINES\.includes\(discipline\)/);
  assert.match(source, /item\.hidden = item\.dataset\.parentDiscipline !== selectedContext\.activeDiscipline/);
  assert.match(source, /disciplineNotice\.hidden = Boolean\(selectedContext\.activeDiscipline\)/);
});

test("multi-athlete changes resolve from the newly selected athlete without carrying URL discipline", () => {
  const source = read(path.join(root, "system-context.js"));
  assert.match(source, /if \(athlete\) selectAthlete\(athlete, false\)/);
  assert.match(source, /requestedDiscipline: preferUrl \? params\.get\("discipline"\) : ""/);
  assert.match(source, /rememberedDiscipline: localStorage\.getItem\(`parent_active_discipline_\$\{id\}`\)/);
  assert.match(source, /disciplineIds\.includes\(context\.activeDiscipline\)/);
});

test("all active child pages use the shared bilingual, themed, context-preserving shell", () => {
  for (const relative of activePages) {
    const html = read(path.join(root, relative));
    assert.match(html, /class="parent-system-page"/, relative);
    assert.match(html, /\/parent\/parent\.css/, relative);
    assert.match(html, /\/parent\/system\/system\.css/, relative);
    assert.match(html, /\/assets\/js\/parent-shell\.js/, relative);
    assert.match(html, /\/parent\/system\/system-page\.js/, relative);
    assert.match(html, /data-parent-system-back[^>]+href="\/parent\/system\//, relative);
    assert.match(html, /data-lang="en"/, relative);
    assert.match(html, /data-lang="es"/, relative);
    assert.doesNotMatch(html, /history\.back\(|\/system\/assets\/|data-lang="sp"|class="sp"|data-lang-block|hidden-lang/, relative);
  }
});

test("all local links and assets on active Parent System pages resolve", () => {
  for (const relative of ["index.html", ...activePages]) {
    const html = read(path.join(root, relative));
    for (const match of html.matchAll(/(?:href|src)="(\/[^"?#]+)"/g)) {
      const local = match[1];
      const resolved = local.endsWith("/") ? path.join("public", local, "index.html") : path.join("public", local);
      assert.ok(fs.existsSync(resolved), `${relative}: missing ${local}`);
    }
  }
});

test("legacy Volunteer resource remains location-specific and unlinked from active Parent System", () => {
  const volunteer = read(path.join(root, "handouts/volunteer.html"));
  const index = read(path.join(root, "index.html"));
  assert.match(volunteer, /Lompoc/);
  assert.doesNotMatch(index, /handouts\/volunteer\.html/);
});

test("active safety content rejects unsafe weight cutting and uncontrolled contact", () => {
  const all = activePages.map((relative) => read(path.join(root, relative))).join("\n");
  assert.doesNotMatch(all, /sauna|sweat suit|skip water|dehydrate to|unsupervised sparring|uncontrolled sparring|hard spar on your own/i);
  assert.match(all, /do not use unsafe weight manipulation/i);
  assert.match(all, /Sparring is coach-controlled/);
});
