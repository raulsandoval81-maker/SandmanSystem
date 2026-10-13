import fs from "node:fs";
import test, {after, before, beforeEach} from "node:test";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from "@firebase/rules-unit-testing";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";

const PROJECT_ID = "sandman-security-boundaries";
let env;

before(async () => {
  env = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      host: "127.0.0.1",
      port: 8081,
      rules: fs.readFileSync("firestore.rules", "utf8"),
    },
  });
});

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await Promise.all([
      setDoc(doc(db, "staff", "admin"), {role: "admin", status: "active"}),
      setDoc(doc(db, "staff", "coach-syv"), {
        role: "coach", status: "active", locationIds: ["santa-ynez-valley"],
      }),
      setDoc(doc(db, "staff", "coach-lompoc"), {
        role: "coach", status: "active", locationIds: ["lompoc"],
      }),
      setDoc(doc(db, "staff", "manager-syv"), {
        role: "management", status: "active", locationIds: ["santa-ynez-valley"],
      }),
      setDoc(doc(db, "staff", "manager-syv-legacy"), {
        role: "management", status: "active", locations: ["santa-ynez-valley"],
      }),
      setDoc(doc(db, "staff", "coach-syv-single"), {
        role: "coach", status: "active", locationId: "santa-ynez-valley",
      }),
      setDoc(doc(db, "staff", "coach-inactive"), {
        role: "coach", status: "inactive", locationIds: ["santa-ynez-valley"],
      }),
      setDoc(doc(db, "staff", "coach-unscoped"), {
        role: "coach", status: "active", locationIds: [],
      }),
      setDoc(doc(db, "athletes", "SYV_100"), {
        authUid: "athlete-syv-auth",
        locationId: "santa-ynez-valley",
        rosterStatus: "current",
        billing: {membershipStatus: "sponsored"},
        rank: "white",
        xp: 42,
      }),
      setDoc(doc(db, "athletes", "LOM_100"), {
        authUid: "athlete-lompoc-auth",
        locationId: "lompoc",
        rosterStatus: "current",
        coachIds: ["coach-lompoc"],
      }),
      setDoc(doc(db, "athletes", "ASSIGNED_100"), {
        locationId: "lompoc",
        rosterStatus: "current",
        coachUid: "coach-syv",
      }),
      setDoc(doc(db, "parentAthleteLinks", "parent-syv_SYV_100"), {
        parentUid: "parent-syv", athleteUid: "SYV_100", status: "active",
      }),
      setDoc(doc(db, "attendance_sessions", "syv-practice"), {
        locationId: "santa-ynez-valley", status: "finalized", presentIds: ["SYV_100"],
      }),
      setDoc(doc(db, "attendance_sessions", "lompoc-practice"), {
        locationId: "lompoc", status: "finalized", presentIds: ["LOM_100"],
      }),
      setDoc(doc(db, "intakePending", "syv-intake"), {locationId: "santa-ynez-valley"}),
      setDoc(doc(db, "intakePending", "lompoc-intake"), {locationId: "lompoc"}),
      setDoc(doc(db, "xpLogs", "syv-xp"), {uid: "SYV_100", amount: 5}),
      setDoc(doc(db, "xpLogs", "lompoc-xp"), {uid: "LOM_100", amount: 5}),
    ]);
  });
});

after(async () => env?.cleanup());

test("unauthorized and anonymous identities cannot read athletes", async () => {
  await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), "athletes", "SYV_100")));
  const stranger = env.authenticatedContext("stranger").firestore();
  await assertFails(getDoc(doc(stranger, "athletes", "SYV_100")));
  await assertFails(getDocs(collection(stranger, "athletes")));
});

test("athlete and linked parent retain canonical sponsored-athlete access", async () => {
  const athlete = await assertSucceeds(getDoc(doc(
    env.authenticatedContext("athlete-syv-auth").firestore(), "athletes", "SYV_100"
  )));
  const parent = await assertSucceeds(getDoc(doc(
    env.authenticatedContext("parent-syv").firestore(), "athletes", "SYV_100"
  )));
  await assertFails(getDoc(doc(
    env.authenticatedContext("parent-syv").firestore(), "athletes", "LOM_100"
  )));
  if (athlete.data().billing.membershipStatus !== "sponsored"
      || parent.data().billing.membershipStatus !== "sponsored") {
    throw new Error("Sponsored membership visibility was not preserved for the authorized family.");
  }
});

test("Coach and Management athlete queries enforce location boundaries", async () => {
  const coach = env.authenticatedContext("coach-syv").firestore();
  const manager = env.authenticatedContext("manager-syv").firestore();
  await assertSucceeds(getDocs(query(
    collection(coach, "athletes"), where("locationId", "==", "santa-ynez-valley")
  )));
  await assertFails(getDocs(query(collection(coach, "athletes"), where("locationId", "==", "lompoc"))));
  await assertSucceeds(getDoc(doc(coach, "athletes", "ASSIGNED_100")));
  await assertSucceeds(getDocs(query(
    collection(manager, "athletes"), where("locationId", "==", "santa-ynez-valley")
  )));
  await assertFails(getDoc(doc(manager, "athletes", "LOM_100")));
  await assertFails(getDocs(collection(coach, "athletes")));
  await assertSucceeds(getDocs(query(
    collection(env.authenticatedContext("manager-syv-legacy").firestore(), "athletes"),
    where("locationId", "==", "santa-ynez-valley")
  )));
  await assertSucceeds(getDocs(query(
    collection(env.authenticatedContext("coach-syv-single").firestore(), "athletes"),
    where("locationId", "==", "santa-ynez-valley")
  )));
  await assertSucceeds(getDocs(collection(
    env.authenticatedContext("admin").firestore(), "athletes"
  )));
  await assertFails(getDocs(query(
    collection(env.authenticatedContext("coach-inactive").firestore(), "athletes"),
    where("locationId", "==", "santa-ynez-valley")
  )));
  await assertFails(getDocs(query(
    collection(env.authenticatedContext("coach-unscoped").firestore(), "athletes"),
    where("locationId", "==", "santa-ynez-valley")
  )));
});

test("attendance is location-readable and always server-write-only", async () => {
  const coach = env.authenticatedContext("coach-syv").firestore();
  const manager = env.authenticatedContext("manager-syv").firestore();
  await assertSucceeds(getDoc(doc(coach, "attendance_sessions", "syv-practice")));
  await assertFails(getDoc(doc(coach, "attendance_sessions", "lompoc-practice")));
  await assertSucceeds(getDoc(doc(manager, "attendance_sessions", "syv-practice")));
  await assertFails(setDoc(doc(coach, "attendance_sessions", "new-practice"), {
    locationId: "santa-ynez-valley", status: "draft",
  }));
  await assertFails(updateDoc(doc(coach, "attendance_sessions", "syv-practice"), {status: "draft"}));
  await assertFails(updateDoc(doc(env.authenticatedContext("admin").firestore(),
    "attendance_sessions", "syv-practice"), {status: "draft"}));
});

test("practice resources require an active in-location Coach owner", async () => {
  const coach = env.authenticatedContext("coach-syv").firestore();
  const other = env.authenticatedContext("coach-lompoc").firestore();
  const plan = doc(coach, "practicePlans", "plan-1");
  await assertSucceeds(setDoc(plan, {
    locationId: "santa-ynez-valley", coachUid: "coach-syv", title: "Wrestling",
  }));
  await assertSucceeds(updateDoc(plan, {title: "Wrestling A"}));
  await assertFails(updateDoc(plan, {locationId: "lompoc"}));
  await assertFails(getDoc(doc(other, "practicePlans", "plan-1")));
  await assertFails(setDoc(doc(coach, "liveSessions", "bad-owner"), {
    locationId: "santa-ynez-valley", coachUid: "coach-lompoc",
  }));
});

test("system writes, XP reads, and pending enrollment remain scoped", async () => {
  const coach = env.authenticatedContext("coach-syv").firestore();
  const manager = env.authenticatedContext("manager-syv").firestore();
  await assertFails(setDoc(doc(coach, "system", "settings"), {enabled: false}));
  await assertSucceeds(getDoc(doc(coach, "xpLogs", "syv-xp")));
  await assertFails(getDoc(doc(coach, "xpLogs", "lompoc-xp")));
  await assertSucceeds(getDoc(doc(manager, "intakePending", "syv-intake")));
  await assertFails(getDoc(doc(manager, "intakePending", "lompoc-intake")));
});
