import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { assertFails, initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { getBytes, ref, uploadBytes } from "firebase/storage";

test("originals, previews, and unrelated paths reject direct clients", async (t) => {
  const env=await initializeTestEnvironment({projectId:"demo-sandman-avatar-storage",storage:{rules:readFileSync("storage.rules","utf8")}});
  t.after(()=>env.cleanup());
  for (const context of [env.unauthenticatedContext(),env.authenticatedContext("athlete-a"),env.authenticatedContext("other-user")]) {
    const storage=context.storage();
    await assertFails(uploadBytes(ref(storage,"athlete-avatars/athlete-a/request/face.svg"),new Blob(["x"],{type:"image/svg+xml"})));
    await assertFails(getBytes(ref(storage,"athlete-avatars/athlete-a/request/original")));
    await assertFails(uploadBytes(ref(storage,"other/unscoped.txt"),new Blob(["x"])));
  }
  assert.doesNotMatch(readFileSync("storage.rules","utf8"),/allow read, write: if true/);
});
