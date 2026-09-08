import fs from "node:fs";
import test, { after, before, beforeEach } from "node:test";
import { assertFails, assertSucceeds, initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc } from "firebase/firestore";

let env;
const projectId = "sandman-location-schedule-rules";
const baseSchedule = (locationId) => ({
  locationId,
  locationName: locationId,
  timezone: "America/Los_Angeles",
  weekly: [],
  events: [],
  banner: { active: false, text: "" },
});

const publishedSchedule = (locationId) => ({
  ...baseSchedule(locationId),
  status: "published",
  publishedAt: new Date(),
});

const draftSchedule = (locationId, uid) => ({
  ...baseSchedule(locationId),
  status: "draft",
  updatedAt: new Date(),
  updatedBy: uid,
});

const unpublishedSchedule = (locationId) => ({
  ...baseSchedule(locationId),
  status: "unpublished",
});

before(async () => {
  env = await initializeTestEnvironment({
    projectId,
    firestore: { host: "127.0.0.1", port: 8081, rules: fs.readFileSync("firestore.rules", "utf8") },
  });
});

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, "staff", "management-syv"), { role: "management", status: "active", locationIds: ["santa-ynez-valley"] });
    await setDoc(doc(db, "staff", "coach-syv"), { role: "coach", status: "active", locationIds: ["santa-ynez-valley"] });
    await setDoc(doc(db, "staff", "admin"), { role: "admin", status: "active" });
    await setDoc(doc(db, "paraSchedule", "santa-ynez-valley"), publishedSchedule("santa-ynez-valley"));
    await setDoc(doc(db, "paraSchedule", "lompoc"), unpublishedSchedule("lompoc"));
  });
});

after(async () => env?.cleanup());

test("published location schedule is publicly readable but unpublished schedule is not", async () => {
  const db = env.unauthenticatedContext().firestore();
  await assertSucceeds(getDoc(doc(db, "paraSchedule", "santa-ynez-valley")));
  await assertFails(getDoc(doc(db, "paraSchedule", "lompoc")));
});

test("assigned Management can save a draft and publish its location", async () => {
  const db = env.authenticatedContext("management-syv").firestore();
  await assertSucceeds(setDoc(doc(db, "paraScheduleDrafts", "santa-ynez-valley"), draftSchedule("santa-ynez-valley", "management-syv")));
  await assertSucceeds(setDoc(doc(db, "paraSchedule", "santa-ynez-valley"), publishedSchedule("santa-ynez-valley")));
});

test("Management cannot publish another location and Coach cannot write schedules", async () => {
  const manager = env.authenticatedContext("management-syv").firestore();
  const coach = env.authenticatedContext("coach-syv").firestore();
  await assertFails(setDoc(doc(manager, "paraSchedule", "lompoc"), publishedSchedule("lompoc")));
  await assertFails(setDoc(doc(coach, "paraSchedule", "santa-ynez-valley"), publishedSchedule("santa-ynez-valley")));
  await assertFails(setDoc(doc(coach, "paraScheduleDrafts", "santa-ynez-valley"), draftSchedule("santa-ynez-valley", "coach-syv")));
});

test("active Admin retains system-wide schedule oversight", async () => {
  const db = env.authenticatedContext("admin").firestore();
  await assertSucceeds(setDoc(doc(db, "paraScheduleDrafts", "elk-grove"), draftSchedule("elk-grove", "admin")));
  await assertSucceeds(setDoc(doc(db, "paraSchedule", "elk-grove"), publishedSchedule("elk-grove")));
});
