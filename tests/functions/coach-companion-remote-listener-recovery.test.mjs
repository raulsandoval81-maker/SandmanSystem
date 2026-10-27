import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Big Clock retries remote listener initialization when identity arrives after auth", async () => {
  const source = await readFile("public/coaches/execution/big-clock-2.0/big-clock-2.0.js", "utf8");
  assert.match(source, /function ensureRemoteControlListener\(\)/);
  assert.match(source, /if \(authReady && !remoteControlPoll\) subscribeRemoteControl\(\)/);
  assert.match(source, /setInterval\(ensureRemoteControlListener, 1000\)/);
  assert.match(source, /if \(!practiceId \|\| remoteControlPoll\) return/);
});

test("Remote polling and acknowledgment errors remain visible on the Big Clock", async () => {
  const source = await readFile("public/coaches/execution/big-clock-2.0/big-clock-2.0.js", "utf8");
  const html = await readFile("public/coaches/execution/big-clock-2.0/index.html", "utf8");
  assert.match(source, /Remote acknowledgment failed:/);
  assert.match(source, /Remote sync needs attention:/);
  assert.match(source, /remoteExecutionStatus/);
  assert.match(html, /id="remoteExecutionStatus"/);
});
