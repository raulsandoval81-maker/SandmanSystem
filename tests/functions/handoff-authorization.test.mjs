import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import { runInNewContext } from "node:vm";

const require = createRequire(new URL("../../functions/package.json", import.meta.url));
const ts = require("typescript");
const source = readFileSync(new URL("../../functions/src/proposals/issueProposalEnrollmentHandoff.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

class HttpsError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

class Timestamp {
  constructor(ms) {
    this.ms = ms;
  }
  static fromMillis(ms) {
    return new Timestamp(ms);
  }
  toMillis() {
    return this.ms;
  }
  toDate() {
    return new Date(this.ms);
  }
}

function fixture({ exists = true, expired = false, staffAllowed = true, locationAllowed = true, changeBeforeCommit = {} } = {}) {
  const events = [];
  const proposal = {
    status: "READY_FOR_CHECKOUT",
    locationId: "synthetic",
    prospect: { email: "guardian@example.invalid" },
    clientReview: { tokenHash: "hash:valid", expiresAt: new Timestamp(Date.now() + (expired ? -1000 : 60000)) },
  };
  const ref = {
    get: async () => {
      events.push("proposal-read");
      return { exists, data: () => proposal };
    },
    update: async () => { events.push("proposal-write"); },
    collection: () => ({ doc: () => ({}) }),
  };
  const modules = {
    "firebase-functions/v2/https": { HttpsError, onCall: (_, handler) => handler },
    "firebase-admin/firestore": {
      getFirestore: () => ({
        collection: () => ({ doc: () => ref }),
        runTransaction: async handler => handler({
          get: async () => {
            events.push("transaction-read");
            return { exists, data: () => ({ ...proposal, ...changeBeforeCommit }) };
          },
          update: () => { events.push("proposal-write"); },
          create: () => { events.push("history-write"); },
        }),
      }),
      FieldValue: { serverTimestamp: () => "server-time" },
      Timestamp,
    },
    "./proposalClientReview": {
      hashProposalReviewToken: token => "hash:" + token,
      createProposalReviewToken: () => { events.push("token-mint"); return "new-token"; },
    },
    "./proposalAccess": {
      requireProposalStaffAccess: async () => {
        events.push("staff-check");
        if (!staffAllowed) throw new HttpsError("permission-denied", "staff denied");
        return { role: "management" };
      },
      requireProposalLocationAccess: (_staff, location) => {
        events.push("location-check");
        if (!locationAllowed || location !== "synthetic") throw new HttpsError("permission-denied", "location denied");
      },
    },
    "../enrollment/earlyCashCheckIntake": {
      canStartEarlyCashCheckIntake: () => false,
      resolveEarlyIntakeStagingRuntime: async () => false,
    },
    "../modules/email/resend": {
      getResendClient: () => ({
        emails: { send: async () => { events.push("email-send"); return { data: { id: "synthetic" } }; } },
      }),
    },
    "./billingPublicBaseUrl": { resolveBillingPublicBaseUrl: () => "https://staging.example.invalid" },
  };
  const exports = {};
  runInNewContext(compiled, { exports, require: id => {
    assert.ok(Object.hasOwn(modules, id), id);
    return modules[id];
  } });
  return { call: exports.issueProposalEnrollmentHandoff, events };
}

const request = (data = {}, auth) => ({ data: { proposalId: "P-000012", ...data }, auth });
const staff = { uid: "synthetic-manager" };
const noSideEffects = events => assert.ok(
  !events.some(event => ["proposal-write", "history-write", "token-mint", "email-send"].includes(event)),
  events.join(", "),
);
const denial = async (fixture, input) => {
  let result;
  await assert.rejects(fixture.call(input), error => {
    result = [error.code, error.message];
    return true;
  });
  noSideEffects(fixture.events);
  return result;
};

test("missing credentials never look up existing or nonexistent proposals", async () => {
  for (const exists of [true, false]) {
    const f = fixture({ exists });
    assert.equal((await denial(f, request()))[0], "unauthenticated");
    assert.deepEqual(f.events, []);
  }
});

test("missing proposals, invalid tokens and expired tokens have identical denials", async () => {
  const missing = await denial(fixture({ exists: false }), request({ clientReviewToken: "valid" }));
  const invalid = await denial(fixture(), request({ clientReviewToken: "invalid" }));
  const expired = await denial(fixture({ expired: true }), request({ clientReviewToken: "valid" }));
  assert.equal(missing[0], "permission-denied");
  assert.deepEqual(missing, invalid);
  assert.deepEqual(missing, expired);
});

test("review tokens never authorize email, even with a staff session", async () => {
  const f = fixture();
  assert.equal((await denial(f, request({ clientReviewToken: "valid", delivery: "email" }, staff)))[0],
    "permission-denied");
  assert.deepEqual(f.events, []);
});

test("nonstaff cannot read and out-of-location staff see the same denial as a missing proposal", async () => {
  const nonstaff = fixture({ staffAllowed: false });
  await denial(nonstaff, request({}, staff));
  assert.deepEqual(nonstaff.events, ["staff-check"]);
  assert.deepEqual(await denial(fixture({ locationAllowed: false }), request({}, staff)),
    await denial(fixture({ exists: false }), request({}, staff)));
});

test("valid review token can issue a local handoff", async () => {
  const f = fixture();
  const result = await f.call(request({ clientReviewToken: "valid" }));
  assert.equal(result.ok, true);
  assert.match(result.enrollmentPath, /token=new-token/);
  assert.deepEqual(f.events, ["proposal-read", "transaction-read", "token-mint", "proposal-write", "history-write"]);
});

test("authorized Management can issue and email for the assigned location", async () => {
  const f = fixture();
  const result = await f.call(request({ delivery: "email" }, staff));
  assert.equal(result.ok, true);
  assert.equal(result.emailId, "synthetic");
  assert.deepEqual(f.events, ["staff-check", "proposal-read", "location-check", "transaction-read", "location-check", "token-mint",
    "proposal-write", "history-write", "email-send", "proposal-write"]);
});

test("revocation between lookup and transaction prevents token minting and writes", async () => {
  const f = fixture({ changeBeforeCommit: { clientReview: {} } });
  assert.deepEqual(await denial(f, request({ clientReviewToken: "valid" })),
    ["permission-denied", "This proposal review link is invalid or expired."]);
  assert.deepEqual(f.events, ["proposal-read", "transaction-read"]);
});

test("expiry between lookup and transaction prevents handoff writes", async () => {
  const f = fixture({ changeBeforeCommit: {
    clientReview: { tokenHash: "hash:valid", expiresAt: new Timestamp(Date.now() - 1000) },
  } });
  assert.equal((await denial(f, request({ clientReviewToken: "valid" })))[0], "permission-denied");
  assert.deepEqual(f.events, ["proposal-read", "transaction-read"]);
});

test("proposal eligibility changes before the transaction stop handoff", async () => {
  const f = fixture({ changeBeforeCommit: { status: "DRAFT" } });
  assert.equal((await denial(f, request({ clientReviewToken: "valid" })))[0], "failed-precondition");
  assert.deepEqual(f.events, ["proposal-read", "transaction-read"]);
});

test("a proposal moved out of Management's location cannot be sent", async () => {
  const f = fixture({ changeBeforeCommit: { locationId: "out-of-scope" } });
  assert.equal((await denial(f, request({ delivery: "email" }, staff)))[0], "permission-denied");
  assert.deepEqual(f.events, ["staff-check", "proposal-read", "location-check",
    "transaction-read", "location-check"]);
});
