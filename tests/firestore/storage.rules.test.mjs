import fs from "node:fs";
import test, {after, before} from "node:test";
import {
  assertFails,
  initializeTestEnvironment,
} from "@firebase/rules-unit-testing";
import {deleteObject, getBytes, ref, uploadBytes} from "firebase/storage";

let env;

before(async () => {
  env = await initializeTestEnvironment({
    projectId: "sandman-storage-security",
    storage: {
      host: "127.0.0.1",
      port: 9199,
      rules: fs.readFileSync("storage.rules", "utf8"),
    },
  });
});
after(async () => env?.cleanup());

test("Storage denies reads, uploads, overwrites, and deletes for every browser identity", async () => {
  for (const context of [
    env.unauthenticatedContext(),
    env.authenticatedContext("athlete"),
    env.authenticatedContext("coach"),
    env.authenticatedContext("admin"),
  ]) {
    const object = ref(context.storage(), "arbitrary/path/video.webm");
    await assertFails(uploadBytes(object, new Uint8Array([1, 2, 3]), {contentType: "video/webm"}));
    await assertFails(getBytes(object));
    await assertFails(deleteObject(object));
  }
});
