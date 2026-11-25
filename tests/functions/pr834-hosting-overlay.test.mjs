import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import test from 'node:test';

const sha256 = path => createHash('sha256').update(readFileSync(path)).digest('hex');

test('PR834 overlay pins the merged correction and only its two Hosting assets', () => {
  const script = readFileSync('scripts/staging/pr834-hosting-overlay.mjs', 'utf8');
  assert.match(script, /4608313bd1966a322edba134def6d4e6cf2bcb40/);
  assert.match(script, /APPROVE_PR834_STAGING_ATHLETE_DASHBOARD_ONLY/);
  assert.match(script, /\/assets\/js\/athlete-self-context\.js/);
  assert.match(script, /\/athletes\/hub\/mini-hub\.html/);
  assert.equal(sha256('public/assets/js/athlete-self-context.js'),
    '1470282f4f0614f035c51d8d9a1e6d299388e9bd403d0050157cd7c66f17d150');
  assert.equal(sha256('public/athletes/hub/mini-hub.html'),
    'd3cca2b9fc858593d7d81ba00a780dc8e64494cce1c5ba375a11bcee79d2756a');
});

test('protected workflow exposes guarded PR834 preflight and deploy actions', () => {
  const workflow = readFileSync('.github/workflows/staging-exact-sha-release.yml', 'utf8');
  assert.match(workflow, /pr834-hosting-preflight/);
  assert.match(workflow, /pr834-hosting-deploy/);
  assert.match(workflow, /ref: 4608313bd1966a322edba134def6d4e6cf2bcb40/);
  assert.match(workflow, /environment: staging/);
  assert.match(workflow, /GITHUB_RUN_ATTEMPT/);
});
