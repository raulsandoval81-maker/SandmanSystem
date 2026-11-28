import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const nav = readFileSync("public/assets/js/athlete-nav.js", "utf8");
const css = readFileSync("public/assets/css/athlete-ui.css", "utf8");

test("Sprint 1 verified ownership and route policy remain the source of truth", () => {
  assert.match(nav, /resolveSignedInSelfAthlete\(\)/);
  assert.match(nav, /persistVerifiedAthleteId\(id\)/);
  assert.match(nav, /canonicalAthleteHref\(path, id\)/);
  assert.match(nav, /clearUnverifiedAthleteId\(\)/);
  assert.match(nav, /if\(urlId && urlId!==id\)/);
  assert.doesNotMatch(nav, /const id = athleteId\(\)/);
  assert.doesNotMatch(nav, /localStorage\.getItem\(key\)\)\.find\(Boolean\)/);
});

test("Settings are in drawer and not duplicated in header", () => {
  assert.match(nav, /<details class="athlete-preferences">/);
  assert.match(nav, /<summary>Settings<\/summary>/);
  assert.match(nav, /drawer\.querySelector\("\[data-athlete-theme\]"\)/);
  assert.doesNotMatch(nav, /header\.querySelector\("\[data-athlete-theme\]"\)/);
  assert.match(nav, /<div data-athlete-links><\/div>/);
  assert.match(nav, /menu\.disabled=true/);
  assert.match(nav, /menu\.disabled=false/);
});

test("appearance, motion and bilingual navigation persist on device", () => {
  for (const key of ["sandman-athlete-theme", "sandman-athlete-motion", "sandman-athlete-language"]) {
    assert.ok(nav.includes(key), key);
  }
  assert.match(nav, /document\.documentElement\.dataset\.athleteMotion=value/);
  assert.match(nav, /document\.documentElement\.dataset\.athleteLanguage=chosen/);
  assert.match(nav, /localStorage\.setItem\(LANGUAGE_KEY,chosen\)/);
  assert.match(nav, /data-athlete-language/);
  assert.match(nav, /value="es">Español/);
  assert.match(nav, /applyLanguage\(language\(\)\)/);
});

test("profile link is only enabled after verified Athlete identity", () => {
  assert.match(nav, /data-athlete-profile-link hidden/);
  assert.match(nav, /profileLink\.href=route\("\/athletes\/profile\/"\)/);
  assert.match(nav, /profileLink\.hidden=false/);
  assert.match(nav, /if\(!resolved\.athleteId \|\| !resolved\.athlete\)/);
});

test("signout and drawer accessibility protections remain", () => {
  assert.match(nav, /signOut\(auth\)/);
  assert.match(nav, /ID_KEYS\.forEach/);
  assert.match(nav, /event\.key==="Escape"/);
  assert.match(nav, /aria-expanded/);
  assert.match(nav, /aria-hidden/);
  assert.match(nav, /getClientRects\(\)\.length>0/);
  assert.match(css, /\.athlete-preferences \[hidden\]\{display:none!important\}/);
  assert.match(css, /html\[data-athlete-motion="reduced"\]/);
});

test("drawer links to the backend-authorized Living Avatar flow without direct writes", () => {
  assert.match(nav, /data-athlete-avatar-link hidden/);
  assert.match(nav, /avatarLink\.href="\/athletes\/avatar\/"/);
  assert.doesNotMatch(nav, /(?:addDoc|setDoc|updateDoc|deleteDoc|uploadBytes|httpsCallable)\(/);
  assert.doesNotMatch(nav, /(?:xp_logs|promoteAthlete|approveAndActivate|createPaymentIntent)/);
});
