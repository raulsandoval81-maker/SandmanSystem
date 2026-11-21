"""Adapt pinned fixture tests to the isolated callable without editing the ZIP."""
import hashlib
from pathlib import Path
import sys

def once(text, old, new):
    if text.count(old) != 1:
        raise ValueError("Pinned test anchor drifted")
    return text.replace(old, new)

def adapt(text):
    text = once(text, 'const { classifyAthlete } = require("../services/authoritativeXpService");',
                'const classifyAthlete = (...args) => fixture().classify(...args);')
    text = once(text, 'authenticated = true } = {})', 'authenticated = true, original = false } = {})')
    text = once(text, '  const records = new Map([[\x60athletes/${athleteId}\x60, athlete]]);', '''  const records = new Map([[\x60athletes/${athleteId}\x60, athlete]]);
  records.set("athleteAssessmentPins/fictional-pin", {
    athleteUid: athleteId, locationId: "fictional-location", status: "RETURNED_TO_MANAGEMENT",
    discipline: "wrestling", priorExperience: { verifiedYears: 1 }
  });''')
    text = once(text, '  runInNewContext(compiled, { exports, require: (name) => stubs[name] ?? require(name) });', '''  const source = original
    ? readFileSync(new URL("../../original-management.js", import.meta.url), "utf8")
    : compiled + "\\nexports.testClassifier = classifyManagementAdjustmentProgram;";
  runInNewContext(source, { exports, require: (name) => stubs[name] ?? require(name) });''')
    text = once(text, '        set: (ref, value) => pending.push(["set", ref, value]),',
                '        set: (ref, value, options) => pending.push(["set", ref, value, options]),')
    text = once(text, 'for (const [operation, ref, value] of pending)',
                'for (const [operation, ref, value, options] of pending)')
    text = once(text, '          records.set(ref.path, value);',
                '          records.set(ref.path, options?.merge ? { ...records.get(ref.path), ...value } : value);')
    text = once(text, '  return { athlete, adjust, writes };', '''  const finalize = (decision) => exports.finalizeExperienceValidation({
    auth: authenticated ? { uid: "fictional-manager" } : undefined,
    data: { pinId: "fictional-pin", decision }
  });
  return { athlete, adjust, writes, finalize, classify: exports.testClassifier };''')
    return text + '''
test("preserved experience validation matches the original approval, receipt replay and rejection", async () => {
  for (const decision of ["approve", "reject"]) {
    const baseline = fixture({ original: true });
    const candidate = fixture();
    // Experience validation classifies the top-level athlete.
    baseline.athlete.progressionTier = candidate.athlete.progressionTier = "T0";
    const comparable = (result) => JSON.parse(JSON.stringify(result, (key, value) =>
      /At$/.test(key) ? undefined : value));
    const expected = await baseline.finalize(decision);
    const actual = await candidate.finalize(decision);
    assert.equal(actual.ok, true);
    assert.deepEqual(comparable(actual), comparable(expected));
    assert.deepEqual(candidate.writes, baseline.writes);
    assert.deepEqual(comparable(candidate.athlete), comparable(baseline.athlete));
    if (decision === "approve") {
      assert.equal(actual.awardedAmount ?? actual.awardedXp ?? actual.delta, 200);
      const replay = await candidate.finalize(decision);
      const originalReplay = await baseline.finalize(decision);
      assert.equal(replay.idempotent, true);
      assert.deepEqual(comparable(replay), comparable(originalReplay));
      assert.deepEqual(candidate.writes, baseline.writes);
    } else {
      assert.equal(actual.status, "REJECTED");
      assert.equal(candidate.athlete.xp, 100);
    }
  }
});
'''

if __name__ == "__main__":
    approved, destination = map(Path, sys.argv[1:])
    data = approved.read_bytes()
    if hashlib.sha256(data).hexdigest() != "c9e68411cd748035f628642fd69780e4784d8afe6e97d3b9dd485f8e6f390de3":
        raise SystemExit("STOP_NO_RETRY: approved fixture hash mismatch")
    destination.write_text(adapt(data.decode()))
