import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {readFileSync, writeFileSync} from 'node:fs';
import {gzipSync} from 'node:zlib';
import {setTimeout as pause} from 'node:timers/promises';

assert.equal(process.env.CONFIRM_PROJECT, 'sandman-combat-staging');
const mode = process.argv[2];
assert(['preflight', 'deploy'].includes(mode));
assert.equal(process.env.GITHUB_REF, 'refs/heads/main');
if (mode === 'deploy') assert.equal(process.env.APPROVAL, 'APPROVE_PR636_STAGING_PRICING_ONLY');
const site = 'sites/sandman-combat-staging';
const candidateSha = '01dfea8ac9660a313a32b4a02ab210c921a2d9ef';
const targets = new Map([
  ['/management/pricing/pricing.js', '5557df6ce09a16e96748310a7e6df92a374d5c68872f1f53086593edf0b4a3d1'],
]);
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

assert.equal(process.env.GITHUB_WORKFLOW_REF,
  'raulsandoval81-maker/SandmanSystem/.github/workflows/staging-exact-sha-release.yml@refs/heads/main');
assert.equal(execFileSync('git', ['-C', 'candidate', 'rev-parse', 'HEAD'], {encoding: 'utf8'}).trim(), candidateSha);
const assets = new Map([...targets].map(([path, hash]) => {
  const bytes = readFileSync('candidate/public' + path);
  assert.equal(sha256(bytes), hash, 'Candidate hash mismatch: ' + path);
  const zipped = gzipSync(bytes, {mtime: 0});
  return [path, {rawHash: hash, hostingHash: sha256(zipped), zipped}];
}));
const token = execFileSync('gcloud', ['auth', 'print-access-token'], {encoding: 'utf8'}).trim();
assert(token, 'No staging credential');

async function get(resource) {
  const response = await fetch('https://firebasehosting.googleapis.com/v1beta1/' + resource, {
    method: 'GET', redirect: 'error', headers: {Authorization: 'Bearer ' + token},
  });
  assert(response.ok, 'Hosting inventory GET failed with HTTP ' + response.status);
  return response.json();
}

async function activeRelease() {
  const {releases} = await get(site + '/releases?pageSize=1');
  const release = releases?.[0];
  assert(release?.name?.startsWith(site + '/releases/'), 'Active release missing');
  assert.match(release.version?.name ?? '', /^sites\/sandman-combat-staging\/versions\/[\w-]+$/);
  return {release: release.name, version: release.version.name};
}

async function manifest(versionName) {
  const live = new Map();
  const seenTokens = new Set();
  let pageToken;
  do {
    const query = new URLSearchParams({pageSize: '1000'});
    if (pageToken) query.set('pageToken', pageToken);
    const page = await get(versionName + '/files?' + query);
    assert(Array.isArray(page.files), 'Missing manifest page');
    for (const file of page.files) {
      assert(file.path?.startsWith('/') && !live.has(file.path), 'Invalid or duplicate manifest path');
      assert.equal(file.status, 'ACTIVE');
      assert.match(file.hash, /^[a-f0-9]{64}$/);
      live.set(file.path, file.hash);
    }
    pageToken = page.nextPageToken;
    if (pageToken) {
      assert(!seenTokens.has(pageToken), 'Repeated pagination token');
      seenTokens.add(pageToken);
    }
  } while (pageToken);

  return live;
}

const baseline = await activeRelease();
if (mode === 'deploy') {
  assert.deepEqual(baseline, {
    release: process.env.EXPECTED_RELEASE,
    version: process.env.EXPECTED_VERSION,
  }, 'Approved Hosting baseline changed');
}
const version = await get(baseline.version);
assert.equal(version.status, 'FINALIZED');
const live = await manifest(baseline.version);

assert.deepEqual(await activeRelease(), baseline, 'Active Hosting release changed during inventory');
const proposed = new Map(live);
for (const [path, {hostingHash}] of assets) {
  assert(live.has(path), 'Target missing from active manifest: ' + path);
  proposed.set(path, hostingHash);
}
const changedPaths = [...live.keys()].filter(path => live.get(path) !== proposed.get(path));
assert.deepEqual(changedPaths.sort(), [...targets.keys()].sort());
const evidence = {site, baseline, rollback: baseline, candidateSha, rawHashes: Object.fromEntries(targets),
  changedPaths, fileCount: live.size, live: Object.fromEntries(live), proposed: Object.fromEntries(proposed)};
writeFileSync('pr636-evidence.json', JSON.stringify(evidence, null, 2) + '\n');
console.log(JSON.stringify({baseline, candidateSha, changedPaths, fileCount: live.size}));

assert(version.config && typeof version.config === 'object', 'Baseline config unavailable');

async function verifyPricingLookup() {
  const root = 'projects/sandman-combat-staging/databases/(default)/documents';
  const endpoint = 'https://firestore.googleapis.com/v1/' + root;
  const auth = {Authorization: 'Bearer ' + token};
  const appointmentId = 'glAVsIyiqEwAgjVDELKG';
  const appointment = await fetch(endpoint + '/admissions_appointments/' + appointmentId + '?mask.fieldPaths=locationId',
    {redirect: 'error', headers: auth});
  assert(appointment.ok, 'Read staging synthetic appointment location: HTTP ' + appointment.status);
  const locationId = (await appointment.json()).fields?.locationId?.stringValue;
  assert(locationId?.trim(), 'Synthetic appointment has no canonical location');
  const filter = (fieldPath, stringValue) => ({
    fieldFilter: {field: {fieldPath}, op: 'EQUAL', value: {stringValue}},
  });
  const response = await fetch(endpoint + ':runQuery', {
    method: 'POST', redirect: 'error', headers: {...auth, 'Content-Type': 'application/json'},
    body: JSON.stringify({structuredQuery: {
      select: {fields: [{fieldPath: '__name__'}]},
      from: [{collectionId: 'proposals'}],
      where: {compositeFilter: {op: 'AND', filters: [
        filter('locationId', locationId.trim()), filter('prospect.appointmentId', appointmentId),
      ]}},
    }}),
  });
  const rows = await response.json();
  assert(response.ok, 'Staging Pricing runQuery: HTTP ' + response.status + ' ' +
    (rows.error?.status || '') + ': ' +
    (/requires an index/i.test(rows.error?.message || '') ? 'missing index; use a location-only lookup with appointment filtering' : 'query failed'));
  assert(rows.some(row => row.document?.name === root + '/proposals/P-000005'),
    'Scoped query did not find existing synthetic proposal P-000005');
  console.log('Staging Pricing compound equality query found P-000005');
}

await verifyPricingLookup();
if (mode === 'preflight') process.exit(0);

const api = 'https://firebasehosting.googleapis.com/v1beta1/';
async function write(url, method, body, contentType = 'application/json') {
  const response = await fetch(url, {
    method, redirect: 'error',
    headers: {Authorization: 'Bearer ' + token, 'Content-Type': contentType},
    body: contentType === 'application/json' ? JSON.stringify(body) : body,
  });
  assert(response.ok, 'Hosting write failed with HTTP ' + response.status);
  return contentType === 'application/json' ? response.json() : undefined;
}

assert.deepEqual(await activeRelease(), baseline, 'Hosting baseline changed before version creation');
const created = await write(api + site + '/versions', 'POST', {config: version.config});
assert.match(created.name, /^sites\/sandman-combat-staging\/versions\/[\w-]+$/);
assert.notEqual(created.name, baseline.version);
const entries = [...proposed];
for (let offset = 0; offset < entries.length; offset += 900) {
  const result = await write(api + created.name + ':populateFiles', 'POST',
    {files: Object.fromEntries(entries.slice(offset, offset + 900))});
  for (const hash of result.uploadRequiredHashes ?? []) {
    const asset = [...assets.values()].find(entry => entry.hostingHash === hash);
    assert(asset, 'Hosting requested an unrelated upload');
    const upload = new URL(result.uploadUrl);
    assert.equal(upload.href, 'https://upload-firebasehosting.googleapis.com/upload/' + created.name + '/files');
    await write(upload.href + '/' + hash, 'POST', asset.zipped, 'application/octet-stream');
  }
}
await write(api + created.name + '?update_mask=status', 'PATCH', {status: 'FINALIZED'});
const prepared = await get(created.name);
assert.equal(prepared.status, 'FINALIZED');
assert.deepEqual(prepared.config, version.config);
assert.deepEqual(await manifest(created.name), proposed);
assert.deepEqual(await activeRelease(), baseline, 'Hosting baseline changed before publish');

const query = new URLSearchParams({versionName: created.name});
const released = await write(api + site + '/releases?' + query, 'POST', {});
const after = await activeRelease();
assert.deepEqual(after, {release: released.name, version: created.name});
const deployed = await manifest(after.version);
assert.deepEqual(deployed, proposed);
for (const [path, hash] of targets) {
  for (let attempt = 1; ; attempt += 1) {
    const url = 'https://sandman-combat-staging.web.app' + path + '?' +
      new URLSearchParams({release: after.release, attempt});
    const response = await fetch(url, {redirect: 'error', headers: {'Cache-Control': 'no-cache'}});
    assert(response.ok, 'Live asset could not be fetched: ' + path);
    const bytes = Buffer.from(await response.arrayBuffer());
    if (sha256(bytes) === hash) break;
    assert(attempt < 6 && sha256(gzipSync(bytes, {mtime: 0})) === live.get(path),
      'Live asset hash differs: ' + path);
    await pause(5000);
  }
}
assert.deepEqual(await activeRelease(), after, 'Hosting release changed during verification');
writeFileSync('pr636-deployed.json', JSON.stringify({
  ...evidence, after, deployed: Object.fromEntries(deployed), verifiedLiveHashes: Object.fromEntries(targets),
}, null, 2) + '\n');
console.log(JSON.stringify({after, rollback: baseline, verifiedLiveHashes: Object.fromEntries(targets)}));
