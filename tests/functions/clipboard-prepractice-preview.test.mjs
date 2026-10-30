import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const html = fs.readFileSync("public/coaches/execution/clipboard-2.0/index.html","utf8");
const source = fs.readFileSync("public/coaches/execution/clipboard-2.0/clipboard-prepractice-preview.mjs","utf8");
test("Clipboard adds a local editor/preview switch without changing launch handlers",()=>{
  assert.match(html,/id="clipboardEditorView"/);
  assert.match(html,/id="clipboardPreviewView"/);
  assert.match(html,/id="clipboardPracticePreview"[^>]*hidden/);
  assert.match(html,/onclick="runPractice\(\)"/);
});
test("Practice Preview reads current plan and never calls Firebase or execution functions",()=>{
  assert.match(source,/readClipboardPlan/);
  assert.match(source,/root\.querySelectorAll\("#planBlocks/);
  assert.match(source,/preview\.replaceChildren\(\)/);
  assert.doesNotMatch(source, /httpsCallable|savePracticeSessionMemory|setDoc|updateDoc|runPractice\(|localStorage\.setItem|setInterval/);
});
