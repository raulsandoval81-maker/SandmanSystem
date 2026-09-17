import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import test from "node:test";

const require = createRequire(import.meta.url);
const ts = require("../../functions/node_modules/typescript");
const path = "public/management/inbox/inbox.js";
const gitSource = process.env.SANDMAN_INBOX_SOURCE_INDEX
  ? `:${path}`
  : process.env.SANDMAN_INBOX_SOURCE_REF
    ? `${process.env.SANDMAN_INBOX_SOURCE_REF}:${path}`
    : "";
const source = gitSource
  ? execFileSync("git", ["show", gitSource], { encoding: "utf8" })
  : readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
const file = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
const html = readFileSync(new URL("../../public/management/inbox/index.html", import.meta.url), "utf8");

function topLevelFunction(name) {
  return file.statements.find((statement) =>
    ts.isFunctionDeclaration(statement) && statement.name?.text === name
  );
}

function topLevelClickListener(receiver, handler) {
  return file.statements.filter((statement) => {
    if (!ts.isExpressionStatement(statement)) return false;
    const call = statement.expression;
    if (!ts.isCallExpression(call) || !ts.isPropertyAccessExpression(call.expression)) return false;
    return call.expression.name.text === "addEventListener"
      && call.expression.expression.getText(file).includes(receiver)
      && call.arguments[0]?.text === "click"
      && call.arguments[1]?.getText(file).includes(handler);
  });
}

test("close and pass actions are module-level handlers", () => {
  const close = topLevelFunction("closeManagementMessage");
  assert.ok(close, "Close Message must be a module-level handler");
  assert.ok(close.body.statements.some((statement) =>
    ts.isTryStatement(statement) && statement.catchClause && statement.finallyBlock
  ), "Close Message must own its success, error, and cleanup paths");
  for (const name of ["confirmPassAttendance", "collectPassPayment", "copyPassPaymentUrl"]) {
    assert.ok(topLevelFunction(name), `${name} must be available during page initialization`);
  }
});

test("each Management pass control binds once at module initialization", () => {
  for (const [receiver, handler] of [
    ["collectPassPaymentButton", "collectPassPayment()"],
    ["confirmPassAttendanceButton", "confirmPassAttendance()"],
    ["copyPassPaymentLink", "copyPassPaymentUrl()"],
    ["closeMessageButton", "closeManagementMessage()"],
  ]) {
    assert.equal(topLevelClickListener(receiver, handler).length, 1,
      `${receiver} must register one top-level click listener for ${handler}`);
  }
});

test("the wired controls exist in the Management Inbox DOM", () => {
  for (const id of [
    "collectPassPaymentButton", "confirmPassAttendanceButton", "copyPassPaymentLink", "closeMessageButton",
  ]) {
    assert.ok(html.includes(`id="${id}"`), `Missing Inbox control: ${id}`);
  }
});
