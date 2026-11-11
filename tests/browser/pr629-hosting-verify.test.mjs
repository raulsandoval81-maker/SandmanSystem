import assert from 'node:assert/strict';
import test from 'node:test';
import {candidateHash, previousHash, verifyPublic} from '../../scripts/staging/pr629-hosting-verify.mjs';

const host = 'sandman-combat-staging.web.app';
const response = (body, type = 'text/javascript', status = 200) =>
  new Response(body, {status, headers: {'content-type': type}});
const options = {hash: bytes => bytes.toString(), pause: async () => {}};

test('retries only known rollback bytes and uses a new cache key', async () => {
  const urls = [];
  const result = await verifyPublic(host, {...options, fetchAsset: async url => {
    urls.push(url);
    return response(urls.length === 1 ? previousHash : candidateHash);
  }});
  assert.equal(result.attempt, 2);
  assert.notEqual(urls[0], urls[1]);
});

test('fails after bounded attempts if rollback bytes persist', async () => {
  let calls = 0;
  await assert.rejects(verifyPublic(host, {...options, attempts: 2, fetchAsset: async () => {
    calls++;
    return response(previousHash);
  }}), /continued serving/);
  assert.equal(calls, 2);
});

test('fails without retry on HTML, unexpected bytes or non-200 responses', async () => {
  for (const reply of [response('<html>', 'text/html'), response('unknown'), response('error', 'text/javascript', 503)]) {
    let calls = 0;
    await assert.rejects(verifyPublic(host, {...options, fetchAsset: async () => {
      calls++;
      return reply;
    }}));
    assert.equal(calls, 1);
  }
});
