'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { recover, stagingFirestoreOptions } = require('../../scripts/staging/recover-v1-activation-history.cjs');
const { isOperationalPaidProposal } = require('../../functions/lib/enrollment/operationalPaidProposal.js');

const intakeId = '5e6c8aa4daf2c4132eaf9e7490c0732a';
const historyId = `athlete_activated_${intakeId}_f8_0002`;
const timestamp = { toMillis: () => 1794521194000 };
const locationId = 'santa-ynez-valley';

function fixture() {
  const doc = (id, value) => ({ id, exists: true, data: () => value });
  const query = docs => ({ docs, size: docs.length });
  const state = {
    proposal: { status: 'PAID', paymentStatus: 'paid', paidAt: timestamp,
      paymentMethod: 'cash_prepaid', locationId,
      cashPrepayment: { amountCents: 96000, membershipPaidInFull: true } },
    intake: { status: 'approved', mode: 'new_athlete', minted: true,
      approvedUid: 'F8_0002', approvedAt: timestamp, locationId },
    athlete: { createdAt: timestamp, locationId },
    events: [],
    extraAthletes: [],
  };
  const history = { where: () => 'history', doc: id => id };
  const db = {
    doc: () => ({ collection: () => history }),
    collection: path => ({ where: () => path }),
    runTransaction: callback => callback({
      get: async ref => {
        if (ref === 'intakes') return query([doc(intakeId, state.intake)]);
        if (ref === 'athletes') return query([doc('F8_0002', state.athlete), ...state.extraAthletes]);
        if (ref === 'history') return query(state.events);
        return doc('P-000009', state.proposal);
      },
      create: (id, value) => {
        assert.equal(id, historyId);
        state.events.push(doc(id, value));
      },
    }),
  };
  return { state, run: apply => recover(db, () => 'server-time', isOperationalPaidProposal, apply) };
}

test('recorded check repair creates only one canonical event and preserves approval time', async () => {
  const { state, run } = fixture();
  assert.equal(await run(false), 'verified, history missing');
  assert.equal(state.events.length, 0);
  assert.equal(await run(true), 'created one activation history event');
  assert.equal(await run(true), 'already verified');
  assert.equal(state.events.length, 1);
  assert.equal(state.events[0].data().occurredAt, timestamp);
  assert.equal(state.events[0].data().createdAt, 'server-time');
});

test('unminted Intake, duplicate athlete UID, or unverified payment prevents recovery', async () => {
  for (const alter of [
    state => { state.intake.minted = false; },
    state => { state.extraAthletes.push({ id: 'different-document' }); },
    state => { state.proposal.paymentStatus = 'unpaid'; },
  ]) {
    const { state, run } = fixture();
    alter(state);
    await assert.rejects(run(true), /do not match/);
    assert.equal(state.events.length, 0);
  }
});

test('conflicting prior history prevents an extra write', async () => {
  const { state, run } = fixture();
  state.events.push({ id: 'existing-event', data: () => ({ athleteUid: 'F8_0002' }) });
  await assert.rejects(run(true), /Conflicting activation history/);
  assert.equal(state.events.length, 1);
});

function loadHandler(path, dependencies) {
  const { readFileSync } = require('node:fs');
  const { runInNewContext } = require('node:vm');
  const exports = {};
  runInNewContext(readFileSync(path, 'utf8'), {
    exports,
    require: name => {
      assert.ok(Object.hasOwn(dependencies, name), name);
      return dependencies[name];
    },
  });
  return exports;
}

test('compiled activation trigger records a paid check activation once across duplicate delivery', async () => {
  const { state } = fixture();
  let eventRecord;
  const db = {
    doc: () => ({ collection: () => ({ doc: () => historyId }) }),
    runTransaction: callback => callback({
      get: async ref => ref === historyId
        ? { exists: Boolean(eventRecord) }
        : { exists: true, data: () => state.proposal },
      create: (id, data) => {
        assert.equal(id, historyId);
        assert.equal(eventRecord, undefined);
        eventRecord = data;
      },
    }),
  };
  const { recordEnrollmentAthleteActivated } = loadHandler('functions/lib/enrollment/enrollmentActivity.js', {
    './operationalPaidProposal': { isOperationalPaidProposal },
    'firebase-admin/firestore': { getFirestore: () => db, FieldValue: { serverTimestamp: () => timestamp } },
    'firebase-functions/v2/firestore': {
      onDocumentCreated() {}, onDocumentWritten() {}, onDocumentUpdated: (_path, handler) => handler,
    },
    'firebase-functions/v2/https': { onCall() {} },
    '../services/staffAuthorization': {},
  });
  const event = { params: { intakeId }, data: {
    before: { data: () => ({ status: 'submitted' }) },
    after: { data: () => ({ ...state.intake, proposalId: 'P-000009' }) },
  } };
  await recordEnrollmentAthleteActivated(event);
  await recordEnrollmentAthleteActivated(event);
  assert.equal(eventRecord.event, 'ATHLETE_ACTIVATED');
  assert.equal(eventRecord.athleteUid, 'F8_0002');
});

test('compiled Members callable returns the direct and location match only once', async () => {
  const athlete = { id: 'F8_0002', exists: true, data: () => ({ locationId }) };
  const db = {
    doc: path => ({ get: async () => {
      assert.equal(path, 'athletes/F8_0002');
      return athlete;
    } }),
    collection: name => ({ where: () => ({ limit: () => ({
      get: async () => ({ docs: name === 'athletes' ? [athlete] : [] }),
    }) }) }),
  };
  class HttpsError extends Error {}
  const { searchManagementMembers } = loadHandler('functions/lib/access/searchManagementMembers.js', {
    'firebase-admin/firestore': { getFirestore: () => db },
    'firebase-functions/v2/https': { HttpsError, onCall: handler => handler },
    '../services/staffAuthorization': { requireActiveStaff: async () => ({}) },
    './managementMemberPolicy': {
      cleanMemberValue: value => String(value).trim(),
      managementLocationScope: () => [locationId],
      mapManagementMember: athleteId => ({ athleteId }),
      memberMatchesSearch: (member, search) => member.athleteId === search,
    },
  });
  await assert.rejects(searchManagementMembers({ data: { search: 'F8_0002' } }), /unauthenticated/);
  const result = await searchManagementMembers({ auth: { uid: 'test-management' }, data: { search: 'F8_0002' } });
  assert.equal(result.members.length, 1);
  assert.equal(result.members[0].athleteId, 'F8_0002');
});

test('repair accepts only the protected staging WIF provider and impersonated deployer', () => {
  const path = '/runner/staging-wif.json';
  const env = {
    GOOGLE_APPLICATION_CREDENTIALS: path,
    GOOGLE_GHA_CREDS_PATH: path,
    CLOUDSDK_AUTH_CREDENTIAL_FILE_OVERRIDE: path,
    GOOGLE_CLOUD_PROJECT: 'sandman-combat-staging',
  };
  const valid = {
    type: 'external_account',
    audience: '//iam.googleapis.com/projects/991554514268/locations/global/' +
      'workloadIdentityPools/sandman-github-staging/providers/sandman-hybrid-staging',
    subject_token_type: 'urn:ietf:params:oauth:token-type:jwt',
    token_url: 'https://sts.googleapis.com/v1/token',
    service_account_impersonation_url: 'https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/' +
      'sandman-practice-deployer@sandman-combat-staging.iam.gserviceaccount.com:generateAccessToken',
  };
  const read = credential => (file, encoding) => {
    assert.equal(file, path);
    assert.equal(encoding, 'utf8');
    return JSON.stringify(credential);
  };
  assert.deepEqual(stagingFirestoreOptions(env, read(valid)), {
    projectId: 'sandman-combat-staging', keyFilename: path,
  });
  for (const changed of [
    { type: 'service_account' },
    { audience: valid.audience + '-different' },
    { service_account_impersonation_url: valid.service_account_impersonation_url.replace('staging', 'production') },
    { token_url: 'https://example.invalid/token' },
  ]) {
    assert.throws(() => stagingFirestoreOptions(env, read({ ...valid, ...changed })), /does not match/);
  }
  assert.throws(() => stagingFirestoreOptions({ ...env, GOOGLE_CLOUD_PROJECT: 'production' }, read(valid)), /credential file and project/);
  assert.throws(() => stagingFirestoreOptions({ ...env, GOOGLE_GHA_CREDS_PATH: '/other.json' }, read(valid)), /credential file and project/);
});

test('preflight uses a read-only transaction and identifies the first denied Firestore operation', async () => {
  const db = {
    doc: () => ({ collection: () => ({ doc: () => 'history' }) }),
    runTransaction: (callback, options) => {
      assert.deepEqual(options, { readOnly: true });
      return callback({
        get: async () => { throw Object.assign(new Error('private detail'), { code: 7 }); },
      });
    },
  };
  await assert.rejects(recover(db, () => null, isOperationalPaidProposal, false), {
    message: 'Firestore BatchGet proposal (opens transaction) failed (status 7).',
  });
});
