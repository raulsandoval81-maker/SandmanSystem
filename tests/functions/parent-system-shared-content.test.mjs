import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const sharedPages = [
  "public/parent/system/progression.html",
  "public/parent/system/xp.html",
  "public/parent/system/ceremonies.html",
  "public/parent/system/fitness-self-defense/index.html",
  "public/parent/system/handouts/how-the-system-works.html",
  "public/parent/system/handouts/policy.html",
];

const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");

test("shared Parent System pages are nonempty and directly loadable", () => {
  for (const relativePath of sharedPages) {
    assert.ok(fs.statSync(path.join(root, relativePath)).size > 0, relativePath);
    assert.match(read(relativePath), /<!doctype html>/i, relativePath);
  }
});

test("shared pages use the Parent shell and stable context-aware return link", () => {
  for (const relativePath of sharedPages) {
    const html = read(relativePath);
    assert.match(html, /\/parent\/parent\.css/, relativePath);
    assert.match(html, /\/assets\/js\/parent-shell\.js/, relativePath);
    assert.match(html, /\/parent\/system\/system\.css/, relativePath);
    assert.match(html, /\/parent\/system\/system-page\.js/, relativePath);
    assert.match(html, /data-parent-system-back[^>]+href="\/parent\/system\/"/, relativePath);
    assert.doesNotMatch(html, /history\.back\s*\(/, relativePath);
  }
});

test("shared pages use EN/ES Parent shell conventions", () => {
  for (const relativePath of sharedPages) {
    const html = read(relativePath);
    assert.match(html, /class="en"/, relativePath);
    assert.match(html, /class="es"/, relativePath);
    assert.match(html, /data-lang="es"/, relativePath);
    assert.doesNotMatch(html, /data-lang="sp"/, relativePath);
  }
});

test("shared content remains discipline-neutral", () => {
  for (const relativePath of sharedPages) {
    assert.doesNotMatch(read(relativePath), /wrestl/i, relativePath);
  }
});

test("ceremonies no longer references its broken legacy shell", () => {
  const html = read("public/parent/system/ceremonies.html");
  for (const stale of ["assets/css/site.css", "public.css", "assets/js/public-shell.js", "overview.html", "programs.html", "about.html"]) {
    assert.ok(!html.includes(stale), stale);
  }
});

test("context helper preserves canonical athlete and discipline parameters", async () => {
  const { getParentSystemContext } = await import("../../public/parent/system/system-page.js");
  assert.equal(getParentSystemContext("?athlete=f4_0001&discipline=Boxing").toString(), "athlete=F4_0001&discipline=boxing");
  assert.equal(getParentSystemContext("").toString(), "");
});

test("shared Parent System local references resolve", () => {
  for (const relativePath of sharedPages) {
    const html = read(relativePath);
    for (const match of html.matchAll(/(?:href|src)="(\/[^"?#]+)"/g)) {
      const target = match[1].endsWith("/") ? `${match[1]}index.html` : match[1];
      assert.ok(fs.existsSync(path.join(root, "public", target)), `${relativePath}: ${match[1]}`);
    }
  }
});
