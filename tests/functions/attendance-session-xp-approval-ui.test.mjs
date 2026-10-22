import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const ui = new URL("../../public/coaches/attendance/index.html", import.meta.url);
const script = new URL("../../public/coaches/attendance/attendance.js", import.meta.url);
const style = new URL("../../public/coaches/attendance/attendance.css", import.meta.url);

test("finalized attendance shows one XP approval action, not redundant attendance buttons", async () => {
  const [html, js, css] = await Promise.all([readFile(ui,"utf8"),readFile(script,"utf8"),readFile(style,"utf8")]);
  assert.match(html, /id="issuePracticeXp"[^>]*>Approve Session XP<\/button>/);
  assert.match(js, /attendanceFinish\.hidden = finalized/);
  assert.match(js, /reviewActions\.hidden = finalized/);
  assert.match(css, /#attendanceFinish\[hidden\]/);
  assert.match(css, /\.toolbar-card \.action-row\[hidden\]/);
  assert.match(html, /id="finalClosePractice"[^>]*hidden/);
  assert.match(js, /if \(button\) button\.hidden = true/);
  assert.match(js, /completePracticeDailyGrind/);
  assert.match(js, /closePracticeSession/);
});

test("roster uses distinct legible surfaces in dark and light themes", async () => {
  const css = await readFile(style,"utf8");
  assert.match(css, /\.attendance-review \.single-roster-athlete \{/);
  assert.match(css, /html\[data-theme="light"\] \.attendance-review \.single-roster-athlete/);
});
