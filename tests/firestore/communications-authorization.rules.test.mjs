import fs from "node:fs";
import test, { after, before, beforeEach } from "node:test";
import { assertFails, assertSucceeds, initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { addDoc, collection, doc, getDoc, serverTimestamp, setDoc, updateDoc } from "firebase/firestore";

const PROJECT_ID = "sandman-communications-authorization";
let env;

before(async () => {
  env = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: { host: "127.0.0.1", port: 8081, rules: fs.readFileSync("firestore.rules", "utf8") },
  });
});

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async context => {
    const db = context.firestore();
    await setDoc(doc(db, "staff", "coach-syv"), { role: "coach", status: "active", locationIds: ["santa-ynez-valley"] });
    await setDoc(doc(db, "staff", "coach-lompoc"), { role: "coach", status: "active", locationIds: ["lompoc"] });
    await setDoc(doc(db, "staff", "admin"), { role: "admin", status: "active" });
    await setDoc(doc(db, "athletes", "F8_1000"), { locationId: "santa-ynez-valley", coachIds: ["coach-syv"] });
    await setDoc(doc(db, "athletes", "F8_2000"), { locationId: "lompoc", coachIds: ["coach-lompoc"] });
    await setDoc(doc(db, "parentAthleteLinks", "parent-one_F8_1000"), {
      parentUid: "parent-one", athleteUid: "F8_1000", status: "active",
    });
    await setDoc(doc(db, "paraThreads", "F8_1000"), {
      athleteUid: "F8_1000", parentUid: "parent-one", athleteName: "One", status: "open",
    });
    await setDoc(doc(db, "paraThreads", "F8_1000", "messages", "parent-message"), {
      athleteUid: "F8_1000", from: "parent", fromUid: "parent-one", fromName: "Parent",
      body: "Hello", createdAt: new Date(), seenByCoach: false, seenByParent: true,
    });
    await setDoc(doc(db, "paraAnnouncements", "announcement"), {
      teamId: "law", category: "training", title: "Practice", message: "Tonight",
      audienceType: "all", from: "coach", fromName: "Coach", createdAt: new Date(), pinned: false,
    });
    await setDoc(doc(db, "paraParentInbox", "legacy"), { source: "system", status: "active" });
    await setDoc(doc(db, "paraVolunteerInbox", "volunteer"), {
      parentUid: "parent-one", parentEmail: "parent@example.com", parentName: "Parent",
      athlete: "One", subject: "Volunteer", status: "pending", source: "parent-volunteer-form",
      linkedVolunteerId: "", createdAt: new Date(), updatedAt: new Date(), coachHasUnread: true,
      parentHasUnread: false, seenByCoach: false, seenByParent: true,
    });
  });
});

after(async () => env?.cleanup());

const threadMessage = (from, fromUid) => ({
  athleteUid: "F8_1000", from, fromUid, fromName: from === "coach" ? "Coach" : "Parent",
  body: "Authorized reply", createdAt: serverTimestamp(), seenByCoach: from === "coach",
  seenByParent: from === "parent",
});

test("paraThreads allows linked Parent and assigned Coach roots and messages", async () => {
  const parentDb = env.authenticatedContext("parent-one").firestore();
  const coachDb = env.authenticatedContext("coach-syv").firestore();
  await assertSucceeds(getDoc(doc(parentDb, "paraThreads", "F8_1000")));
  await assertSucceeds(updateDoc(doc(parentDb, "paraThreads", "F8_1000"), { lastBody: "Parent update" }));
  await assertSucceeds(addDoc(collection(parentDb, "paraThreads", "F8_1000", "messages"), threadMessage("parent", "parent-one")));
  await assertSucceeds(getDoc(doc(coachDb, "paraThreads", "F8_1000")));
  await assertSucceeds(updateDoc(doc(coachDb, "paraThreads", "F8_1000"), { coachHasUnread: false }));
  await assertSucceeds(addDoc(collection(coachDb, "paraThreads", "F8_1000", "messages"), threadMessage("coach", "coach-syv")));
});

test("paraThreads denies unrelated, arbitrary, anonymous, URL-swapped, and identity-escalation access", async () => {
  for (const context of [env.authenticatedContext("parent-two"), env.authenticatedContext("random"), env.unauthenticatedContext()]) {
    await assertFails(getDoc(doc(context.firestore(), "paraThreads", "F8_1000")));
  }
  await assertFails(getDoc(doc(env.authenticatedContext("coach-lompoc").firestore(), "paraThreads", "F8_1000")));
  await assertFails(getDoc(doc(env.authenticatedContext("parent-one").firestore(), "paraThreads", "F8_2000")));
  await assertFails(updateDoc(doc(env.authenticatedContext("parent-one").firestore(), "paraThreads", "F8_1000"), { parentUid: "parent-two" }));
  await assertFails(addDoc(collection(env.authenticatedContext("parent-one").firestore(), "paraThreads", "F8_1000", "messages"), threadMessage("parent", "parent-two")));
});

test("paraAnnouncements permits readers but only active Coach/Admin authors", async () => {
  for (const uid of ["parent-one", "athlete", "random", "coach-syv", "admin"]) {
    await assertSucceeds(getDoc(doc(env.authenticatedContext(uid).firestore(), "paraAnnouncements", "announcement")));
  }
  await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), "paraAnnouncements", "announcement")));
  const payload = { teamId: "law", category: "training", title: "New", message: "Details", audienceType: "all", from: "coach", fromName: "Coach", createdAt: serverTimestamp() };
  await assertSucceeds(setDoc(doc(env.authenticatedContext("coach-syv").firestore(), "paraAnnouncements", "coach-new"), payload));
  await assertSucceeds(setDoc(doc(env.authenticatedContext("admin").firestore(), "paraAnnouncements", "admin-new"), payload));
  for (const uid of ["parent-one", "athlete", "random"]) {
    await assertFails(setDoc(doc(env.authenticatedContext(uid).firestore(), "paraAnnouncements", `${uid}-new`), payload));
    await assertFails(updateDoc(doc(env.authenticatedContext(uid).firestore(), "paraAnnouncements", "announcement"), { pinned: true }));
  }
  await assertSucceeds(updateDoc(doc(env.authenticatedContext("coach-syv").firestore(), "paraAnnouncements", "announcement"), { pinned: true }));
  await assertFails(updateDoc(doc(env.authenticatedContext("coach-syv").firestore(), "paraAnnouncements", "announcement"), { from: "admin" }));
});

test("paraParentInbox is bounded to active Coach/Admin clients", async () => {
  for (const uid of ["coach-syv", "admin"]) {
    await assertSucceeds(getDoc(doc(env.authenticatedContext(uid).firestore(), "paraParentInbox", "legacy")));
  }
  for (const context of [env.authenticatedContext("parent-one"), env.authenticatedContext("random"), env.unauthenticatedContext()]) {
    await assertFails(getDoc(doc(context.firestore(), "paraParentInbox", "legacy")));
    await assertFails(setDoc(doc(context.firestore(), "paraParentInbox", "unauthorized"), { status: "active" }));
  }
});

test("paraVolunteerInbox allows owner and active Coach/Admin but denies others and owner mutation", async () => {
  for (const uid of ["parent-one", "coach-syv", "admin"]) {
    await assertSucceeds(getDoc(doc(env.authenticatedContext(uid).firestore(), "paraVolunteerInbox", "volunteer")));
  }
  for (const context of [env.authenticatedContext("parent-two"), env.authenticatedContext("random"), env.unauthenticatedContext()]) {
    await assertFails(getDoc(doc(context.firestore(), "paraVolunteerInbox", "volunteer")));
  }
  await assertSucceeds(updateDoc(doc(env.authenticatedContext("parent-one").firestore(), "paraVolunteerInbox", "volunteer"), { seenByParent: true }));
  await assertFails(updateDoc(doc(env.authenticatedContext("parent-one").firestore(), "paraVolunteerInbox", "volunteer"), { parentUid: "parent-two" }));
  await assertSucceeds(addDoc(collection(env.authenticatedContext("parent-one").firestore(), "paraVolunteerInbox", "volunteer", "thread"), {
    from: "parent", fromName: "Parent", body: "I can help", createdAt: serverTimestamp(), seenByCoach: false, seenByParent: true,
  }));
});

test("paraVolunteerInbox preserves both active Parent volunteer payload generations", async () => {
  const db = env.authenticatedContext("parent-one").firestore();
  await assertSucceeds(setDoc(doc(db, "paraVolunteerInbox", "current-shape"), {
    parentUid: "parent-one", parentEmail: "parent@example.com", parentName: "Parent",
    athlete: "One", subject: "Volunteer Interest", status: "pending", source: "parent-volunteer-form",
    linkedVolunteerId: "", createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
    coachHasUnread: true, parentHasUnread: false, seenByCoach: false, seenByParent: true,
  }));
  await assertSucceeds(setDoc(doc(db, "paraVolunteerInbox", "legacy-shape"), {
    parentUid: "parent-one", name: "Parent", email: "parent@example.com", athlete: "One",
    type: "Events", helpAreas: ["Events"], status: "open", source: "parent-volunteer-form",
    createdAt: serverTimestamp(),
  }));
});
