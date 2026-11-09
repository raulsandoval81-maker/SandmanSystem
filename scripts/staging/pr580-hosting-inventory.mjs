import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {readFileSync, writeFileSync} from 'node:fs';
import {gzipSync} from 'node:zlib';

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
const hostingHash = sha256(gzipSync(bytes, {mtime: 0}));
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

const baseline = await activeRelease();
const version = await get(baseline.version);
assert.equal(version.status, 'FINALIZED');
const live = new Map();
const seenTokens = new Set();
let pageToken;
do {
  const query = new URLSearchParams({pageSize: '1000'});
  if (pageToken) query.set('pageToken', pageToken);
  const page = await get(baseline.version + '/files?' + query);
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
