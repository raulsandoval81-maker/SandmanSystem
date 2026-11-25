import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {readFileSync, writeFileSync} from 'node:fs';
import {gzipSync} from 'node:zlib';

const mode = process.argv[2];
const project = 'sandman-combat-staging';
const site = `sites/${project}`;
const profiles = {
  pr834: {
    candidateSha: '4608313bd1966a322edba134def6d4e6cf2bcb40',
    approval: 'APPROVE_PR834_STAGING_ATHLETE_DASHBOARD_ONLY',
    targets: [
      ['/assets/js/athlete-self-context.js', '1470282f4f0614f035c51d8d9a1e6d299388e9bd403d0050157cd7c66f17d150'],
      ['/athletes/hub/mini-hub.html', 'd3cca2b9fc858593d7d81ba00a780dc8e64494cce1c5ba375a11bcee79d2756a'],
    ],
  },
  pr837: {
    candidateSha: 'bbf3e9c054371cb72a2f69a1b64e0bce6baf0565',
    approval: 'APPROVE_PR837_STAGING_ATHLETE_RESOLVER_ONLY',
    targets: [
      ['/assets/js/athlete-self-context.js', '4d2cabb1a1e161ff6268e5c638c4a2173f35e86b88717e599ef74f4a16823801'],
    ],
  },
};
const profileName = process.env.P0_HOSTING_PROFILE || 'pr834';
const profile = profiles[profileName];
assert(profile, 'Unknown P0 Hosting profile');
const {candidateSha, approval} = profile;
const targets = new Map(profile.targets);
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

assert(['preflight', 'deploy'].includes(mode));
assert.equal(process.env.CONFIRM_PROJECT, project);
assert.equal(process.env.GITHUB_REF, 'refs/heads/main');
assert.equal(process.env.GITHUB_RUN_ATTEMPT, '1');
assert.equal(process.env.GITHUB_WORKFLOW_REF,
  'raulsandoval81-maker/SandmanSystem/.github/workflows/staging-exact-sha-release.yml@refs/heads/main');
if (mode === 'deploy') assert.equal(process.env.APPROVAL, approval);
assert.equal(execFileSync('git', ['-C', 'candidate', 'rev-parse', 'HEAD'], {encoding: 'utf8'}).trim(), candidateSha);

const assets = new Map([...targets].map(([path, rawHash]) => {
  const bytes = readFileSync('candidate/public' + path);
  assert.equal(sha256(bytes), rawHash, 'Candidate hash mismatch: ' + path);
  const zipped = gzipSync(bytes, {mtime: 0});
  return [path, {rawHash, hostingHash: sha256(zipped), zipped}];
}));
const token = execFileSync('gcloud', ['auth', 'print-access-token'], {encoding: 'utf8'}).trim();
assert(token, 'No staging credential');
const api = 'https://firebasehosting.googleapis.com/v1beta1/';

async function call(resource, method = 'GET', body, contentType = 'application/json') {
  const response = await fetch(resource.startsWith('https:') ? resource : api + resource, {
    method, redirect: 'error',
    headers: {Authorization: 'Bearer ' + token, ...(body ? {'Content-Type': contentType} : {})},
    body: body === undefined ? undefined : contentType === 'application/json' ? JSON.stringify(body) : body,
  });
  assert(response.ok, `Hosting ${method} failed with HTTP ${response.status}`);
  return contentType === 'application/json' ? response.json() : undefined;
}

async function activeRelease() {
  const {releases} = await call(site + '/releases?pageSize=1');
  const release = releases?.[0];
  assert(release?.name?.startsWith(site + '/releases/'), 'Active release missing');
  assert.match(release.version?.name ?? '', /^sites\/sandman-combat-staging\/versions\/[\w-]+$/);
  return {release: release.name, version: release.version.name};
}

async function manifest(versionName) {
  const files = new Map();
  const pageTokens = new Set();
  let pageToken;
  do {
    const query = new URLSearchParams({pageSize: '1000'});
    if (pageToken) query.set('pageToken', pageToken);
    const page = await call(versionName + '/files?' + query);
    for (const file of page.files ?? []) {
      assert(file.path?.startsWith('/') && !files.has(file.path));
      assert.equal(file.status, 'ACTIVE');
      assert.match(file.hash, /^[a-f0-9]{64}$/);
      files.set(file.path, file.hash);
    }
    pageToken = page.nextPageToken;
    if (pageToken) {
      assert(!pageTokens.has(pageToken));
      pageTokens.add(pageToken);
    }
  } while (pageToken);
  return files;
}

const baseline = await activeRelease();
if (mode === 'deploy') assert.deepEqual(baseline, {
  release: process.env.EXPECTED_RELEASE, version: process.env.EXPECTED_VERSION,
}, 'Approved Hosting baseline changed');
const version = await call(baseline.version);
assert.equal(version.status, 'FINALIZED');
const live = await manifest(baseline.version);
assert.deepEqual(await activeRelease(), baseline, 'Active release changed during inventory');
const proposed = new Map(live);
for (const [path, asset] of assets) {
  assert(live.has(path), 'Target missing from active manifest: ' + path);
  proposed.set(path, asset.hostingHash);
}
const changedPaths = [...live].filter(([path, hash]) => proposed.get(path) !== hash).map(([path]) => path).sort();
assert.deepEqual(changedPaths, [...targets.keys()].sort());
const evidence = {site, baseline, rollback: baseline, candidateSha,
  rawHashes: Object.fromEntries(targets), changedPaths, fileCount: live.size};
writeFileSync(`${profileName}-evidence.json`, JSON.stringify(evidence, null, 2) + '\n');
console.log(JSON.stringify(evidence));
if (mode === 'preflight') process.exit(0);

assert(version.config && typeof version.config === 'object');
assert.deepEqual(await activeRelease(), baseline, 'Hosting baseline changed before version creation');
const created = await call(site + '/versions', 'POST', {config: version.config});
assert.match(created.name, /^sites\/sandman-combat-staging\/versions\/[\w-]+$/);
const entries = [...proposed];
for (let offset = 0; offset < entries.length; offset += 900) {
  const populated = await call(created.name + ':populateFiles', 'POST',
    {files: Object.fromEntries(entries.slice(offset, offset + 900))});
  for (const hash of populated.uploadRequiredHashes ?? []) {
    const asset = [...assets.values()].find(value => value.hostingHash === hash);
    assert(asset, 'Hosting requested an unrelated upload');
    const upload = new URL(populated.uploadUrl);
    assert.equal(upload.origin, 'https://upload-firebasehosting.googleapis.com');
    await call(upload.href + '/' + hash, 'POST', asset.zipped, 'application/octet-stream');
  }
}
await call(created.name + '?update_mask=status', 'PATCH', {status: 'FINALIZED'});
assert.deepEqual(await manifest(created.name), proposed);
assert.deepEqual(await activeRelease(), baseline, 'Hosting baseline changed before publish');
const released = await call(site + '/releases?' + new URLSearchParams({versionName: created.name}), 'POST', {});
const after = await activeRelease();
assert.deepEqual(after, {release: released.name, version: created.name});
assert.deepEqual(await manifest(after.version), proposed);
for (const [path, hash] of targets) {
  const response = await fetch(`https://${project}.web.app${path}?release=${encodeURIComponent(after.release)}`,
    {redirect: 'error', headers: {'Cache-Control': 'no-cache'}});
  assert(response.ok);
  assert.equal(sha256(Buffer.from(await response.arrayBuffer())), hash, 'Published hash mismatch: ' + path);
}
writeFileSync(`${profileName}-deployed.json`, JSON.stringify({...evidence, after}, null, 2) + '\n');
console.log(JSON.stringify({after, rollback: baseline, verifiedLiveHashes: Object.fromEntries(targets)}));
