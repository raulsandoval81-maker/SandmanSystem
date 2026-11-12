import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {readFileSync, writeFileSync} from 'node:fs';
import {gzipSync} from 'node:zlib';

const mode = process.argv[2] ?? 'inventory';
assert(['inventory', 'deploy'].includes(mode));
const site = 'sites/sandman-combat-staging';
const profile = process.argv[3] ?? 'waiver';
assert(['waiver', 'edge-case-embed', 'v1-ui'].includes(profile));
const edgeCase = profile === 'edge-case-embed';
const v1Ui = profile === 'v1-ui';
const evidencePrefix = v1Ui ? 'v1-ui' : edgeCase ? 'edge-case-embed' : 'pr603';
const candidateSha = v1Ui ? 'eeb0552e3acf0904f63934aa2c9b303915b74cd7' : edgeCase ? '47b986f27ebbf98e456af5f64f1f6450023f279c' : '053deeae91c768c156d47edc6926f8c92e5aa4c4';
const targets = new Map(v1Ui ? [
  ['/connect/proposals/review/review.js', 'd6110610bb918a261d1457c7d94653be8aef9c401c236be82e09794ec27f5323'],
  ['/intake-parent/parent.intake.js', 'fbb0494959035f666ec1650d3c050503e3758d6adf3e85c2165b29fd504253e4'],
  ['/intake-management/index.html', 'e4d533ad1c7e304796787315bab1df247c5b4459f51adf73f871aca536827afa'],
  ['/intake-management/management.intake.js', '8699206f09907e716591bf79f0804b49420c18b74d4587b2f0ac2abdea7a14d5'],
] : edgeCase ? [
  ['/connect/proposals/index.html', 'f0076ded80713f8b46d2ec1ab6b0a27ef3d2f4146408f0233f3d151b6832569c'],
  ['/connect/proposals/proposals.js', '54922a5f18e63ef02ae04f14b32807d7e2acb764c22038c6d0727ad9d837dd6c'],
  ['/management/manual-edge-case-proposal/index.html', '732d6d76d7acc7739619055711e6de5167011eddb1bce9615ec8807962c2202d'],
  ['/management/manual-edge-case-proposal/tool.js', '7a1c38e8e03275194d21caa7b4637ad683b7ac0fdb38f3e9c053ea498f935ff3'],
] : [
  ['/intake-parent/parent.intake.js', '3854208b270595db466c4192666db51572b31cbc045e9f9b4c71f1175324d486'],
  ['/intake-athlete/athlete.intake.js', '87c8345a8bc77e3cda95110bd3c5931b768f7c227189ac527d94b4c1b7ff9454'],
  ['/waiver/index.html', '776295841c8fbe8c70c3da572571de4e866a3d2eecf5e11cc0189f7d1a31eaac'],
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
assert.deepEqual(changedPaths.sort(), edgeCase
  ? ['/connect/proposals/index.html']
  : [...targets.keys()].sort());
const evidence = {site, baseline, rollback: baseline, candidateSha, rawHashes: Object.fromEntries(targets),
  changedPaths, fileCount: live.size, live: Object.fromEntries(live), proposed: Object.fromEntries(proposed)};
writeFileSync(evidencePrefix + '-evidence.json', JSON.stringify(evidence, null, 2) + '\n');
console.log(JSON.stringify({baseline, candidateSha, changedPaths, fileCount: live.size}));

if (mode === 'deploy') {
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
  if (edgeCase) {
    writeFileSync(evidencePrefix + '-published.json', JSON.stringify({
      ...evidence, after, deployed: Object.fromEntries(deployed),
    }, null, 2) + '\n');
  }
  for (const [path, hash] of targets) {
    const route = path.endsWith('/index.html') ? path.slice(0, -'index.html'.length) : path;
    const url = 'https://sandman-combat-staging.web.app' + route + '?release=' + encodeURIComponent(after.release);
    const response = await fetch(url, {redirect: 'error', headers: {'Cache-Control': 'no-cache'}});
    assert(response.ok, 'Live asset could not be fetched: ' + path);
    assert.equal(sha256(Buffer.from(await response.arrayBuffer())), hash, 'Live asset hash differs: ' + path);
  }
  assert.deepEqual(await activeRelease(), after, 'Hosting release changed during verification');
  writeFileSync(evidencePrefix + '-deployed.json', JSON.stringify({
    ...evidence, after, deployed: Object.fromEntries(deployed), verifiedLiveHashes: Object.fromEntries(targets),
  }, null, 2) + '\n');
  console.log(JSON.stringify({after, rollback: baseline, verifiedLiveHashes: Object.fromEntries(targets)}));
}
