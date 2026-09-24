import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const buildRoot = process.env.SANDMAN_TEST_BUILD_DIR || "../../functions/lib";
const {
  buildCertificatePayload,
} = require(`${buildRoot}/engines/certificate-engine/certificatePayloadEngine.js`);
const {
  markStripeCertificateIssuedTransaction,
} = require(`${buildRoot}/services/recognitionService.js`);
const {
  runMarkStripeCertificateIssued,
} = require(`${buildRoot}/modules/markStripeCertificateIssued.js`);
const {
  normalizeAthlete,
} = require(`${buildRoot}/engines/athlete-engine/athleteNormalizer.js`);

function athlete(overrides = {}) {
  return {
    uid: "F4_CERT_1",
    uidCode: "F4_CERT_1",
    publicName: "Certificate Athlete",
    fullName: "Certificate Athlete",
    track: "F4",
    tier: "T0",
    stripeCount: 1,
    xp: 250,
    xpCap: 1000,
    locationId: "lompoc",
    coachUid: "coach-1",
    certificates: [],
    recognitionHistory: [],
    testing: { state: "ACTIVE" },
    ...overrides,
  };
}

function fakeDb(initial) {
  let record = structuredClone(initial);
  let writes = 0;
  let sequence = Promise.resolve();
  const ref = { id: initial.uid };
  return {
    collection() {
      return { doc() { return ref; } };
    },
    runTransaction(callback) {
      const result = sequence.then(() => callback({
        async get() {
          return { exists: true, data: () => structuredClone(record) };
        },
        update(_ref, patch) {
          record = { ...record, ...patch };
          writes += 1;
        },
      }));
      sequence = result.then(() => undefined, () => undefined);
      return result;
    },
    snapshot: () => structuredClone(record),
    writes: () => writes,
  };
}

const coach = {
  uid: "coach-1",
  role: "coach",
  staff: { locationIds: ["lompoc"] },
};

test("new stripe is print ready and recognitionHistory suppresses it after issuance", () => {
  const before = buildCertificatePayload({
    ...athlete(),
    id: "F4_CERT_1",
    name: "Certificate Athlete",
    programCode: "F4",
    programName: "Foundry 4",
    tier: 0,
    tierCode: "T0",
    stripe: 1,
    coach: "Coach",
    rankName: "",
    rankColor: "",
  });
  assert.equal(before.printReady, true);
  assert.equal(before.stripe, 1);

  const after = buildCertificatePayload({
    ...athlete(),
    id: "F4_CERT_1",
    name: "Certificate Athlete",
    programCode: "F4",
    programName: "Foundry 4",
    tier: 0,
    tierCode: "T0",
    stripe: 1,
    coach: "Coach",
    rankName: "",
    rankColor: "",
    recognitionHistory: [{ type: "STRIPE_AWARD", tier: 0, stripe: 1 }],
  });
  assert.equal(after.printReady, false);
  assert.equal(after.reason, "CERTIFICATE_ALREADY_COMPLETED");
});

test("issue is durable, concurrent retries are idempotent, and original evidence remains", async () => {
  const db = fakeDb(athlete());
  const request = { athleteId: "F4_CERT_1", expectedTier: 0, expectedStripe: 1 };
  const [first, retry] = await Promise.all([
    markStripeCertificateIssuedTransaction(coach, request, db),
    markStripeCertificateIssuedTransaction(coach, request, db),
  ]);
  assert.deepEqual([first.idempotent, retry.idempotent].sort(), [false, true]);
  assert.equal(db.writes(), 1);
  const history = db.snapshot().recognitionHistory;
  assert.equal(history.length, 1);
  assert.equal(history[0].coach, "coach-1");
  const original = structuredClone(history[0]);
  const later = await markStripeCertificateIssuedTransaction(coach, request, db);
  assert.equal(later.idempotent, true);
  assert.deepEqual(db.snapshot().recognitionHistory[0], original);
  const reloadPayload = buildCertificatePayload(normalizeAthlete(db.snapshot()));
  assert.equal(reloadPayload.printReady, false);
  assert.equal(reloadPayload.reason, "CERTIFICATE_ALREADY_COMPLETED");
});

test("stale certificate fails closed while next stripe and next-tier stripe remain independent", async () => {
  const db = fakeDb(athlete());
  await assert.rejects(
    markStripeCertificateIssuedTransaction(
      coach,
      { athleteId: "F4_CERT_1", expectedTier: 0, expectedStripe: 2 },
      db
    ),
    /certificate changed/i
  );

  const stripe2 = buildCertificatePayload({
    ...athlete({ stripeCount: 2, xp: 500 }),
    id: "F4_CERT_1", name: "Certificate Athlete", programCode: "F4",
    programName: "Foundry 4", tier: 0, tierCode: "T0", stripe: 2,
    coach: "Coach", rankName: "", rankColor: "",
    recognitionHistory: [{ type: "STRIPE_AWARD", tier: 0, stripe: 1 }],
  });
  assert.equal(stripe2.printReady, true);
  assert.equal(stripe2.stripe, 2);

  const nextTier = buildCertificatePayload({
    ...athlete({ tier: "T1", stripeCount: 1, xp: 400, xpCap: 1600 }),
    id: "F4_CERT_1", name: "Certificate Athlete", programCode: "F4",
    programName: "Foundry 4", tier: 1, tierCode: "T1", stripe: 1,
    coach: "Coach", rankName: "", rankColor: "",
    recognitionHistory: [{ type: "STRIPE_AWARD", tier: 0, stripe: 1 }],
  });
  assert.equal(nextTier.printReady, true);
  assert.equal(nextTier.stripe, 1);
});

test("final stripe completion suppresses printing without changing testing state", () => {
  const testing = { state: "ELIGIBLE", testEligibleAt: "2026-01-01" };
  const payload = buildCertificatePayload({
    ...athlete({ stripeCount: 4, xp: 1000, testing }),
    id: "F4_CERT_1", name: "Certificate Athlete", programCode: "F4",
    programName: "Foundry 4", tier: 0, tierCode: "T0", stripe: 4,
    coach: "Coach", rankName: "", rankColor: "",
    recognitionHistory: [{ type: "STRIPE_AWARD", tier: 0, stripe: 4 }],
  });
  assert.equal(payload.printReady, false);
  assert.equal(payload.reason, "CERTIFICATE_ALREADY_COMPLETED");
  assert.deepEqual(testing, { state: "ELIGIBLE", testEligibleAt: "2026-01-01" });
});

test("legacy certificate evidence is idempotent and does not create recognitionHistory", async () => {
  const db = fakeDb(athlete({ certificates: [{ type: "STRIPE", tier: 0, stripe: 1 }] }));
  const result = await markStripeCertificateIssuedTransaction(
    coach,
    { athleteId: "F4_CERT_1", expectedTier: 0, expectedStripe: 1 },
    db
  );
  assert.equal(result.idempotent, true);
  assert.equal(db.writes(), 0);
  assert.deepEqual(db.snapshot().recognitionHistory, []);
});

test("athlete scope rejects an unauthorized Coach and permits Admin", async () => {
  const deniedDb = fakeDb(athlete({ coachUid: "coach-2", locationId: "santa-ynez-valley" }));
  await assert.rejects(
    markStripeCertificateIssuedTransaction(
      coach,
      { athleteId: "F4_CERT_1", expectedTier: 0, expectedStripe: 1 },
      deniedDb
    ),
    /outside the Coach's authorized training scope/i
  );
  assert.equal(deniedDb.writes(), 0);

  const adminDb = fakeDb(athlete({ coachUid: "coach-2", locationId: "santa-ynez-valley" }));
  const result = await markStripeCertificateIssuedTransaction(
    { uid: "admin-1", role: "admin", staff: {} },
    { athleteId: "F4_CERT_1", expectedTier: 0, expectedStripe: 1 },
    adminDb
  );
  assert.equal(result.idempotent, false);
  assert.equal(adminDb.snapshot().recognitionHistory[0].coach, "admin-1");
});

test("callable boundary requires auth and delegates only after active staff resolution", async () => {
  let marked = 0;
  const deps = {
    loadActor: async () => coach,
    markIssued: async () => { marked += 1; return { ok: true }; },
  };
  await assert.rejects(runMarkStripeCertificateIssued({ data: {} }, deps), /sign-in/i);
  assert.equal(marked, 0);
  await runMarkStripeCertificateIssued({
    authUid: "coach-1",
    data: { athleteId: "F4_CERT_1", expectedTier: 0, expectedStripe: 1 },
  }, deps);
  assert.equal(marked, 1);
  await assert.rejects(runMarkStripeCertificateIssued({
    authUid: "inactive",
    data: {},
  }, {
    loadActor: async () => { throw new Error("Active Coach or Admin access required."); },
    markIssued: deps.markIssued,
  }), /active coach/i);
});

test("generator only exposes issuance for an engine-loaded non-manual certificate", () => {
  const source = readFileSync(
    new URL("../../public/coaches/ceremonies/certificates/generator.js", import.meta.url),
    "utf8"
  );
  assert.match(source, /enginePayloadState\.loaded/);
  assert.match(source, /fields\.mode\.value !== "manual"/);
  assert.match(source, /httpsCallable\(functions, "markStripeCertificateIssued"\)/);
  assert.doesNotMatch(source, /window\.print\(\)[\s\S]{0,120}markCertificateIssued/);
});
