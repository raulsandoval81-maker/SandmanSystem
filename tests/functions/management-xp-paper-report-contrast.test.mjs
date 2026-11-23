import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve, dirname } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const read = path => readFileSync(resolve(root, path), "utf8");
const css = read("public/management/xp-adjustments/xp-adjustments.css");
const html = read("public/management/xp-adjustments/index.html");
const paper = read("public/management/xp-adjustments/coach-paper-queue.js");
const recovery = read("public/management/xp-adjustments/coach-recovery-queue.js");

function luminance(hex) {
  const values = hex.slice(1).match(/.{2}/g).map(pair => parseInt(pair, 16) / 255);
  const channels = values.map(x => x <= .04045 ? x / 12.92 : ((x + .055) / 1.055) ** 2.4);
  return .2126 * channels[0] + .7152 * channels[1] + .0722 * channels[2];
}
function contrast(fg, bg) {
  const a = luminance(fg), b = luminance(bg);
  return (Math.max(a, b) + .05) / (Math.min(a, b) + .05);
}
test("light-theme report typography passes WCAG AA normal-text contrast", () => {
  for (const [fg, bg, description] of [
    ["#293647", "#ffffff", "report paragraphs"],
    ["#415067", "#ffffff", "report metadata"],
    ["#192536", "#ffffff", "report summary"],
    ["#172536", "#e8edf3", "table header"],
    ["#27354a", "#f4f7fa", "striped table row"],
    ["#205b35", "#e4f3e8", "reviewed status"],
    ["#6c480d", "#fff2d5", "pending status"],
    ["#862b2b", "#fceaea", "rejected status"],
  ]) {
    assert.ok(contrast(fg, bg) >= 4.5, description + " is below WCAG AA");
  }
});
test("contrast is confined to paper and recovery report queues, excluding dark mode", () => {
  assert.match(css, /html:not\(\[data-theme="dark"\]\) \.coach-xp-queue/);
  assert.match(html, /class="adjustment-card coach-xp-queue" id="coachPaperQueue"/);
  assert.match(html, /class="adjustment-card coach-xp-queue" id="coachRecoveryQueue"/);
  assert.match(html, /xp-adjustments\.css\?v=20261123-contrast-1/);
  assert.match(html, /coach-paper-queue\.js\?v=20261123-contrast-1/);
  assert.match(html, /coach-recovery-queue\.js\?v=20261123-contrast-1/);
});
test("report details retain accessible summary and table presentation", () => {
  for (const script of [paper, recovery]) {
    assert.match(script, /class="coach-xp-report" data-report-status=/);
    assert.match(script, /class="coach-xp-report__summary"/);
    assert.match(script, /class="coach-xp-report__status"/);
    assert.match(script, /class="coach-xp-report__table-wrap"/);
    assert.match(script, /class="coach-xp-report__table"/);
    assert.match(script, /class="coach-xp-report__management-note"/);
    assert.match(script, /class="coach-xp-report__textarea"/);
  }
});
test("review actions remain distinct from XP adjustment and award logic", () => {
  assert.match(paper, /review\(\{reportId,decision,note\}\)/);
  assert.match(recovery, /review\(\{requestId:id,decision,note\}\)/);
  assert.match(paper, /data-decision="REVIEWED"/);
  assert.match(paper, /data-decision="REJECTED"/);
  assert.match(recovery, /data-decision="REVIEWED"/);
  assert.match(recovery, /data-decision="REJECTED"/);
});
