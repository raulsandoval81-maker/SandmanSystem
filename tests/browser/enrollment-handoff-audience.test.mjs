import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {runInNewContext} from 'node:vm';

const source = readFileSync(new URL('../../public/intake-management/enrollment-handoff-audience.js', import.meta.url), 'utf8');
const normalizeCard = source.slice(source.indexOf('async function normalizeCard('), source.indexOf('async function normalizeReadyCards('));

function fixture({paymentMethod, receiptControl = false, addDuringInference = false}) {
  let reads = 0;
  const actions = {
    children: ['original'],
    querySelector: () => receiptControl,
    replaceChildren(button) { this.children = [button]; },
  };
  const card = {
    dataset: {readyProposal: 'P-000002'},
    querySelector: selector => selector === '[data-ready-2c]' ? receiptControl : actions,
  };
  const normalize = runInNewContext(normalizeCard + '\nnormalizeCard', {
    clean: String, db: {}, doc: () => ({}),
    getDoc: async () => {
      reads++;
      return {id: 'P-000002', exists: () => true, data: () => ({paymentMethod})};
    },
    inferAudienceWithLead: async () => {
      if (addDuringInference) receiptControl = true;
      return 'parent_guardian';
    },
    labelForAudience: () => 'Parent / Guardian',
    document: {createElement: () => ({dataset: {}, addEventListener() {}})},
  });
  return {actions, run: () => normalize(card), reads: () => reads};
}

test('leaves the receipt-first controls intact without reading again', async () => {
  const page = fixture({paymentMethod: 'cash_prepaid', receiptControl: true});
  await page.run();
  assert.deepEqual(page.actions.children, ['original']);
  assert.equal(page.reads(), 0);
});

test('does not install a generic token action on a Cash/Check proposal', async () => {
  const page = fixture({paymentMethod: 'cash_prepaid'});
  await page.run();
  assert.deepEqual(page.actions.children, ['original']);
});

test('leaves receipt-first controls that appear during asynchronous audience inference', async () => {
  const page = fixture({paymentMethod: 'stripe', addDuringInference: true});
  await page.run();
  assert.deepEqual(page.actions.children, ['original']);
});

test('still resolves the audience for a non-Cash/Check card', async () => {
  const page = fixture({paymentMethod: 'stripe'});
  await page.run();
  assert.equal(page.actions.children[0].dataset.resolvedAudience, 'parent_guardian');
});
