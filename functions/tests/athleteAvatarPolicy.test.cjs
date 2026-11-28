const test = require("node:test");
const assert = require("node:assert/strict");
const { avatarRequiresGuardian, avatarShirtColor, illustratedAvatarSvg, validateAvatarRaster } = require("../lib/modules/athlete/athleteAvatarPolicy.js");

test("rank shirts follow approved grappling and striking mapping", () => {
  const expected = { Prospect:"yellow", Competitor:"orange", Contender:"green", Champion:"black", Warrior:"blue", Hero:"purple", Veteran:"brown", Legend:"black" };
  for (const [rankName, color] of Object.entries(expected)) assert.equal(avatarShirtColor({ rankName, programKind:"boxing" }), color);
  assert.equal(avatarShirtColor({ rankName:"Shadow", programKind:"wrestling" }), "white");
  assert.equal(avatarShirtColor({ rankName:"Shadow", programKind:"boxing" }), "gray");
  assert.equal(avatarShirtColor({ rankName:"Apprentice", programKind:"submission-grappling" }), "white");
  assert.equal(avatarShirtColor({ rankName:"Apprentice", programKind:"kickboxing" }), "gray");
});

test("all minors and unknown ages require guardian approval", () => {
  assert.equal(avatarRequiresGuardian({ journey:"ROAD2CHAMPION" }, "athlete"), true);
  assert.equal(avatarRequiresGuardian({ trackBase:"F8" }, "athlete"), true);
  assert.equal(avatarRequiresGuardian({ journey:"PATH2LEGEND", dateOfBirth:"2011-05-02" }, "F4_123"), true);
  assert.equal(avatarRequiresGuardian({ journey:"PATH2LEGEND" }, "F4_123"), true);
  assert.equal(avatarRequiresGuardian({ journey:"PATH2LEGEND", dateOfBirth:"1990-05-02" }, "F4_123"), false);
  assert.equal(avatarRequiresGuardian({ journey:"PATH2LEGEND", dateOfBirth:"invalid" }, "F4_123"), true);
});

test("photo validation accepts known raster types but blocks embedded-photo SVG", () => {
  const jpeg=Buffer.concat([Buffer.from([0xff,0xd8,0xff]),Buffer.alloc(64)]);
  assert.equal(validateAvatarRaster("image/jpeg",jpeg),"image/jpeg");
  assert.throws(()=>validateAvatarRaster("image/png",jpeg),/INVALID_AVATAR_IMAGE_TYPE/);
  assert.throws(() => illustratedAvatarSvg("image/jpeg",jpeg), /AVATAR_ILLUSTRATION_RENDERER_UNAVAILABLE/);
});
