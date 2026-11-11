import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const proposals = readFileSync(new URL('../../public/connect/proposals/proposals.js', import.meta.url), 'utf8');
const tool = readFileSync(new URL('../../public/management/manual-edge-case-proposal/tool.js', import.meta.url), 'utf8');
const id = 'P-000123';
const origin = 'https://sandman-combat-staging.web.app';
const draft = {
  status: 'DRAFT',
  priorPayments: [{paymentMethod: 'Check', amountCents: 11000}],
  athletes: [{billingTerm: 'Month-to-Month'}],
  pricing: {monthlyBalance: 80, enrollmentBase: 30}
};

function proposalHarness() {
  const source = {};
  const calls = [];
  const frame = {contentWindow: source, dataset: {edgeCaseProposal: id}};
  const context = vm.createContext({
    URLSearchParams, esc: String, money: value => '$' + value,
    window: {location: {origin}, addEventListener: (_, handler) => { context.receive = handler; }},
    document: {querySelectorAll: () => [frame]},
    loadProposalQueue: async proposalId => { calls.push(proposalId); }
  });
  vm.runInContext(proposals.slice(proposals.indexOf('const edgeCaseAudits'), proposals.indexOf('function proposalCardHtml')), context);
  return {render: context.edgeCaseReviewHtml, receive: context.receive, source, calls};
}

test('standard proposals without historical payments keep their original actions', () => {
  const {render} = proposalHarness();
  assert.equal(render({...draft, priorPayments: []}, id), '');
  assert.match(proposals, /\$\{proposalActionHtml\(/);
});

test('historical Check draft renders a lazy, proposal-scoped Edge Case review', () => {
  const html = proposalHarness().render(draft, id);
  assert.match(html, /Management Actions · Edge Case Review/);
  assert.match(html, /Month-to-Month.*\n\s*\$80 monthly ·\s*\$30 enrollment/);
  assert.match(html, /data-edge-case-url="[^"]+proposalId=P-000123&embedded=1"/);
  assert.doesNotMatch(html, /<iframe[^>]+\ssrc=/);
  assert.match(proposals, /if \(details\.open && !frame\.hasAttribute\("src"\)\)/);
});

test('signed, reconciled, and Stripe histories explain ineligibility without opening an editor', () => {
  const {render} = proposalHarness();
  for (const proposal of [
    {...draft, clientAcceptance: {}},
    {...draft, historicalCashDisposition: {status: 'recorded'}},
    {...draft, priorPayments: [{paymentMethod: 'Stripe'}]}
  ]) {
    const html = render(proposal, id);
    assert.match(html, /Corrections require/);
    assert.doesNotMatch(html, /<iframe/);
  }
});

test('only the matching iframe save refreshes the proposal and retains its audit reference', async () => {
  const {render, receive, source, calls} = proposalHarness();
  const event = {origin, source, data: {type: 'sandman:edge-case-saved', proposalId: id, auditId: 'audit-123'}};
  await receive({...event, origin: 'https://other.example'});
  await receive({...event, source: {}});
  await receive({...event, data: {...event.data, proposalId: 'P-000999'}});
  assert.deepEqual(calls, []);
  await receive(event);
  await receive(event);
  assert.deepEqual(calls, [id]);
  assert.match(render(draft, id), /Audit reference: audit-123/);
});

test('embedded tool pins the ID and requires a preview, reason, and confirmation before reporting success', async () => {
  const nodes = new Map();
  const get = id => {
    if (!nodes.has(id)) nodes.set(id, {value: '', style: {}, addEventListener() {}, querySelectorAll: () => []});
    return nodes.get(id);
  };
  const requests = [];
  const messages = [];
  const context = vm.createContext({
    document: {getElementById: get}, URLSearchParams, location: {origin, search: '?embedded=1&proposalId=' + id},
    window: {parent: {postMessage: (...args) => messages.push(args)}},
    functions: {}, requireManagement: async () => ({}), crypto: {randomUUID: () => 'action-id'},
    httpsCallable: (_, name) => async data => {
      assert.equal(name, 'manualEdgeCaseProposal');
      requests.push(data);
      if (data.mode === 'load') return {data: {...draft, proposalId: id, priorPayments: []}};
      return {data: {proposalId: id, auditId: 'audit-123'}};
    }
  });
  vm.runInContext(tool.replace(/^import .*;$/gm, ''), context);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(get('loadForm').hidden, true);
  get('proposalId').value = 'P-000999';
  await context.loadCase();
  assert.ok(requests.every(request => request.proposalId === id));
  await context.commitCase();
  vm.runInContext('preview = {fingerprint: "preview-hash"}; pendingEntries = [];', context);
  await context.commitCase();
  get('confirm').checked = true;
  await context.commitCase();
  assert.equal(requests.filter(request => request.mode === 'commit').length, 0);
  get('reason').value = 'Verified historical receipt';
  await context.commitCase();
  assert.equal(requests.at(-1).expectedFingerprint, 'preview-hash');
  assert.equal(requests.at(-1).proposalId, id);
  assert.equal(messages[0][0].auditId, 'audit-123');
  assert.equal(messages[0][1], origin);
});
