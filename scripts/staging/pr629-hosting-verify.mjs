import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash, randomUUID} from 'node:crypto';
import {readFileSync, writeFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {setTimeout as sleep} from 'node:timers/promises';

const site = 'sites/sandman-combat-staging';
const path = '/intake-management/review.js';
const candidate = 'a92bfd47957403f32d3d180cb92b6fcdd0cfea25';
export const candidateHash = 'c94f18d28353629b08323371846b83df90a69d364f51efb6d3d0de2717aca08b';
export const previousHash = '8c79945994b2f16216a293fd3eb8b2e3d9bf37887547bb101915a0b4500f7655';
const hostingHash = 'd620ddb09e6d747786475bd406dfda6916e604c03e4b54cd89c8a35b696c92af';
const rollback = {release: site + '/releases/1794346535116000', version: site + '/versions/47353efb145a2546'};
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

export async function verifyPublic(host, {fetchAsset = fetch, pause = sleep, attempts = 6, hash = sha256} = {}) {
  assert(['sandman-combat-staging.web.app', 'sandman-combat-staging.firebaseapp.com'].includes(host));
  for (let attempt = 1; attempt <= attempts; attempt++) {
    const url = 'https://' + host + path + '?verify=' + randomUUID();
    const response = await fetchAsset(url, {
      redirect: 'error', headers: {'Cache-Control': 'no-cache'},
    });
    assert.equal(response.status, 200, 'Unexpected asset response status');
    assert.match(response.headers.get('content-type') ?? '', /^(text|application)\/(java|ecma)script\b/i);
    const bytes = Buffer.from(await response.arrayBuffer());
    const observed = hash(bytes);
    if (observed === candidateHash) return {host, observed, attempt};
    assert.equal(observed, previousHash, 'Asset differs from both the candidate and rollback bytes');
    if (attempt < attempts) await pause(5000);
  }
  throw Error('Public endpoint continued serving the previous bytes: ' + host);
}

async function readManifest(get, version) {
  const entries = new Map();
  const seen = new Set();
  let cursor;
  do {
    const query = new URLSearchParams({pageSize: '1000'});
    if (cursor) query.set('pageToken', cursor);
    const result = await get(version + '/files?' + query);
    assert(Array.isArray(result.files), 'Missing manifest page');
    for (const item of result.files) {
      assert(item.path.startsWith('/') && !entries.has(item.path), 'Invalid manifest path');
      assert.equal(item.status, 'ACTIVE');
      assert.match(item.hash, /^[a-f0-9]{64}$/);
      entries.set(item.path, item.hash);
    }
    cursor = result.nextPageToken;
    assert(!seen.has(cursor), 'Repeated manifest cursor');
    if (cursor) seen.add(cursor);
  } while (cursor);
  return entries;
}

async function main() {
  assert.equal(process.env.GITHUB_WORKFLOW_REF,
    'raulsandoval81-maker/SandmanSystem/.github/workflows/staging-exact-sha-release.yml@refs/heads/main');
  assert.equal(process.env.CONFIRM_PROJECT, 'sandman-combat-staging');
  assert.equal(execFileSync('git', ['-C', 'candidate', 'rev-parse', 'HEAD'], {encoding: 'utf8'}).trim(), candidate);
  assert.equal(sha256(readFileSync('candidate/public' + path)), candidateHash);
  const token = execFileSync('gcloud', ['auth', 'print-access-token'], {encoding: 'utf8'}).trim();
  assert(token, 'No staging credential');
  async function get(resource) {
    const response = await fetch('https://firebasehosting.googleapis.com/v1beta1/' + resource, {
      method: 'GET', redirect: 'error', headers: {Authorization: 'Bearer ' + token},
    });
    assert(response.ok, 'Hosting GET failed with HTTP ' + response.status);
    return response.json();
  }
  async function activeRelease() {
    const {releases} = await get(site + '/releases?pageSize=1');
    assert.equal(releases?.length, 1);
    const {name, version} = releases[0];
    assert.match(name, /^sites\/sandman-combat-staging\/releases\/\d+$/);
    assert.match(version.name, /^sites\/sandman-combat-staging\/versions\/[\da-f]*1a4dcd$/);
    return {release: name, version: version.name};
  }
  const current = await activeRelease();
  const result = {run: 42976247777, candidate, current, rollback};
  console.log(JSON.stringify(result));
  const [original, published, manifest] = await Promise.all([
    get(rollback.version), get(current.version), readManifest(get, current.version),
  ]);
  assert.equal(published.status, 'FINALIZED');
  assert(original.config && typeof original.config === 'object');
  assert.deepEqual(published.config, original.config);
  assert.equal(manifest.size, 3070);
  assert.equal(manifest.get(path), hostingHash);
  const sorted = Object.fromEntries([...manifest].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0));
  const manifestSha256 = sha256(JSON.stringify(sorted));
  assert.equal(manifestSha256, '52fcb9df06bac28dc340a33ced42b59c66db1469394634c986f23de0f8123e41',
    'Active manifest differs from the proposal saved by run #359');
  const hosts = await Promise.all([
    verifyPublic('sandman-combat-staging.web.app'),
    verifyPublic('sandman-combat-staging.firebaseapp.com'),
  ]);
  assert.deepEqual(await activeRelease(), current, 'Active release changed during verification');
  const evidence = {...result, hostingHash, manifestSha256, hosts, mode: 'READ_ONLY', passed: true};
  writeFileSync('pr629-verification.json', JSON.stringify(evidence, null, 2) + '\n');
  console.log(JSON.stringify(evidence));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
