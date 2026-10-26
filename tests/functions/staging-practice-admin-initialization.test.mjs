import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("staff authorization initializes Admin at point of use for callable cold starts", async () => {
  const source = await readFile("functions/src/services/staffAuthorization.ts", "utf8");
  assert.match(source, /import \{ getApp, initializeApp \} from "firebase-admin\/app"/);
  assert.match(source, /function staffFirestore\(\)/);
  assert.match(source, /getFirestore\(getApp\(\)\)/);
  assert.match(source, /code !== "app\/no-app"/);
  assert.match(source, /getFirestore\(initializeApp\(\)\)/);
  assert.match(source, /const snap = await staffFirestore\(\)\.doc\(`staff\/\$\{staffUid\}`\)\.get\(\)/);
  assert.match(source, /const snap = await staffFirestore\(\)\.doc\(`athletes\/\$\{id\}`\)\.get\(\)/);
  assert.doesNotMatch(source, /await getFirestore\(\)\.doc\(/);
});

test("practice callables still enforce active Coach or Admin staff access", async () => {
  const source = await readFile("functions/src/practice/practiceSessions.ts", "utf8");
  assert.match(source, /export const updatePracticeCheckIn = onCall/);
  assert.match(source, /const actor = await requireActiveStaff\(request\.auth\.uid, PRACTICE_STAFF_ROLES/);
});
