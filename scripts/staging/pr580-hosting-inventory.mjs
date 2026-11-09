import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {readFileSync, writeFileSync} from 'node:fs';
import {gzipSync} from 'node:zlib';

const mode = process.argv[2] ?? 'inventory';
assert(['inventory', 'deploy'].includes(mode));
const site = 'sites/sandman-combat-staging';
const candidateSha = 'e5047f7433cb6f57c6c86f172a54aeeafff4a541';
const target = '/intake-management/management.intake.js';
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

assert.equal(process.env.GITHUB_WORKFLOW_REF,
  'raulsandoval81-maker/SandmanSystem/.github/workflows/staging-exact-sha-release.yml@refs/heads/main');
assert.equal(execFileSync('git', ['-C', 'candidate', 'rev-parse', 'HEAD'], {encoding: 'utf8'}).trim(), candidateSha);
const bytes = readFileSync('candidate/public' + target);
const rawHash = sha256(bytes);
assert.equal(rawHash, '3a478cac6a5e0ab01a2fd9071b019977d1e863bd8b37cf06a816757e3e1b8149');
const zipped = gzipSync(bytes, {mtime: 0});
const hostingHash = sha256(zipped);
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
    release: site + '/releases/1794175883220000',
    version: site + '/versions/27f3d950a1f022b3',
  }, 'Approved Hosting baseline changed');
}
const version = await get(baseline.version);
assert.equal(version.status, 'FINALIZED');
const live = await manifest(baseline.version);

assert.deepEqual(await activeRelease(), baseline, 'Active Hosting release changed during inventory');
assert(live.has(target), 'Target missing from active manifest');
const proposed = new Map(live);
proposed.set(target, hostingHash);
const changedPaths = [...new Set([...live.keys(), ...proposed.keys()])]
  .filter(file => live.get(file) !== proposed.get(file));
assert.deepEqual(changedPaths, [target]);
const evidence = {site, baseline, rollback: baseline, candidateSha, rawHash, hostingHash,
  changedPaths, fileCount: live.size, live: Object.fromEntries(live), proposed: Object.fromEntries(proposed)};
writeFileSync('pr580-evidence.json', JSON.stringify(evidence, null, 2) + '\n');
console.log(JSON.stringify({baseline, candidateSha, rawHash, hostingHash, changedPaths, fileCount: live.size}));

if (mode === 'deploy') {
  assert.equal(live.size, 3070);
  assert(version.config && typeof version.config === 'object', 'Baseline config unavailable');

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
      assert.equal(hash, hostingHash, 'Hosting requested an unrelated upload');
      const upload = new URL(result.uploadUrl);
      assert.equal(upload.href, 'https://upload-firebasehosting.googleapis.com/upload/' + created.name);
      await write(upload.href + '/' + hash, 'POST', zipped, 'application/octet-stream');
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
  const url = 'https://sandman-combat-staging.web.app' + target + '?release=' + encodeURIComponent(after.release);
  const response = await fetch(url, {redirect: 'error', headers: {'Cache-Control': 'no-cache'}});
  assert(response.ok, 'Live asset could not be fetched');
  assert.equal(sha256(Buffer.from(await response.arrayBuffer())), rawHash, 'Live asset hash differs');
  assert.deepEqual(await activeRelease(), after, 'Hosting release changed during verification');
  writeFileSync('pr580-deployed.json', JSON.stringify({
    ...evidence, after, deployed: Object.fromEntries(deployed), verifiedLiveSha256: rawHash,
  }, null, 2) + '\n');
  console.log(JSON.stringify({after, rollback: baseline, verifiedLiveSha256: rawHash}));
}
