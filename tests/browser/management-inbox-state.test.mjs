import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { inboxView, passActionState } from "../../public/management/inbox/inbox-state.js";

const base = { topic: "programs", status: "REVIEWING", routingStage: "MANAGEMENT_TRIAGE" };

test("Inbox opens on actionable Active work and excludes every Closed variant", () => {
  assert.equal(inboxView(base), "ACTIVE");
  for (const field of ["status", "messageStatus", "routingStage"]) {
    assert.equal(inboxView({ ...base, [field]: "CLOSED" }), "CLOSED");
  }
  const html = readFileSync("public/management/inbox/index.html", "utf8");
  assert.deepEqual([...html.matchAll(/data-inbox-view="([A-Z]+)"/g)].map((match) => match[1]),
    ["ACTIVE", "WAITING", "RESPONDED"]);
});

test("existing routing and response states resolve to Waiting or Responded", () => {
  for (const routingStage of ["ADMIN_GUIDANCE_REQUESTED", "COACH_ASSIGNED", "COACH_REVIEWING"]) {
    assert.equal(inboxView({ ...base, routingStage }), "WAITING");
  }
  assert.equal(inboxView({ ...base, messageStatus: "RESPONDED", routingStage: "MANAGEMENT_RESPONDED" }), "RESPONDED");
  assert.equal(inboxView({ ...base, status: "RESPONDED" }), "RESPONDED");
});

test("pass actions follow attendance, pending payment, paid, and closure gates", () => {
  const pass = { ...base, topic: "request-pass", passType: "combat-dropin-1day" };
  assert.equal(inboxView(pass), "ACTIVE");
  assert.deepEqual(passActionState(pass), { confirmAttendance: true, collectPayment: false, close: false });
  const attended = { ...pass, passAttendanceConfirmedAt: "timestamp" };
  assert.deepEqual(passActionState(attended), { confirmAttendance: false, collectPayment: true, close: false });
  const pending = { ...attended, passPaymentStatus: "pending" };
  assert.equal(inboxView(pending), "WAITING");
  assert.equal(passActionState(pending).collectPayment, true);
  const paid = { ...pending, passPaymentStatus: "paid", stripePaymentIntentId: "pi_test" };
  assert.equal(inboxView(paid), "ACTIVE");
  assert.deepEqual(passActionState(paid), { confirmAttendance: false, collectPayment: false, close: true });
  assert.equal(passActionState({ ...paid, routingStage: "CLOSED" }).close, false);
  assert.equal(passActionState({ ...pass, passType: "other" }).confirmAttendance, false);
});

test("Inbox and Hub consume one derived view without changing scoped queries", () => {
  const inbox = readFileSync("public/management/inbox/inbox.js", "utf8");
  const hub = readFileSync("public/management/hub/management.js", "utf8");
  assert.match(inbox, /inboxView\(message\) !== currentView/);
  assert.match(hub, /inboxView\(message\) === "ACTIVE"/);
  assert.match(inbox, /where\("locationId", "in", chunk\)/);
  assert.match(inbox, /where\("assignedManagerUid", "==", managementContext\.user\.uid\)/);
  assert.match(inbox, /where\("assignmentStatus", "==", "PENDING_MANAGEMENT"\)/);
  assert.match(inbox, /httpsCallable\(functions, "markManagementMessageResponded"\)/);
  assert.match(inbox, /"sendManagementMessageEmail"/);
  assert.match(inbox, /"storeClosedMessageIntelligence"/);
  assert.match(inbox, /showView\(inboxView\(selectedMessage\)\)/);
});
