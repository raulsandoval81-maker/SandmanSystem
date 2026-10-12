// Emulator-only regression coverage for cross-training source revision authority.
const test = require("node:test");
const assert = require("node:assert/strict");
const { initializeApp, getApps } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
if (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.GCLOUD_PROJECT?.startsWith("demo-")) {
  throw Error("Emulator-only test: refusing production Firestore");
}
if (!getApps().length) initializeApp({ projectId: process.env.GCLOUD_PROJECT });
const db = getFirestore();
const assign = require("../lib/schedules/upsertAthleteCrossTrainingAssignment").upsertAthleteCrossTrainingAssignment;
const suffix = String(process.pid);
const uid = "F8_HISTORY_REV_" + suffix;
const staffUid = "history-revision-admin-" + suffix;
const request = (disciplineIds, extra = {}) => ({
  auth: { uid: staffUid, token: {} },
  data: { athleteId: uid, hostLocationId: "lompoc", rosterId: "history-test",
    disciplineIds, status: "active", ...extra },
});
const revision = async (discipline) => {
  const snap = await db.doc(`athletes/${uid}/historyRevisions/${discipline}`).get();
  return snap.exists ? snap.get("revision") : 0;
};
test("cross-training revisions: creation, retry and discipline replacement", async () => {
  await db.doc(`staff/${staffUid}`).set({ role: "admin", status: "active" });
  await db.doc(`athletes/${uid}`).set({
    locationId: "santa-ynez-valley", primaryDiscipline: "wrestling",
    disciplineIds: ["wrestling", "boxing"],
    disciplines: { wrestling: { locationId: "santa-ynez-valley" },
      boxing: { locationId: "santa-ynez-valley" } },
  });
  const first = await assign.run(request(["wrestling"]));
  assert.equal(first.ok, true);
  assert.equal(first.homeLocationId, "santa-ynez-valley");
  assert.equal(await revision("wrestling"), 1);
  await assign.run(request(["wrestling"]));
  assert.equal(await revision("wrestling"), 1, "identical retry must not bump");
  await assign.run(request(["boxing"]));
  assert.equal(await revision("wrestling"), 2, "removed scope must invalidate");
  assert.equal(await revision("boxing"), 1, "added scope must invalidate");
  await assign.run(request(["boxing"], { status: "inactive" }));
  assert.equal(await revision("boxing"), 2, "deactivation must invalidate");
  await assign.run(request(["boxing"], { status: "inactive" }));
  assert.equal(await revision("boxing"), 2, "duplicate deactivation must not bump");
});
test("cross-training revisions: concurrent identical requests have one effect", async () => {
  const before = await revision("wrestling");
  const results = await Promise.allSettled([
    assign.run(request(["wrestling"], { status: "inactive" })),
    assign.run(request(["wrestling"], { status: "inactive" })),
  ]);
  assert.ok(results.every(x => x.status === "fulfilled"), JSON.stringify(results));
  assert.equal(await revision("wrestling"), before + 1);
});

const normalizeEnrollment = require("../lib/enrollment/syncActivatedEnrollmentPlacement").syncActivatedEnrollmentPlacement;
test("enrollment location change invalidates every recorded discipline once", async () => {
  const id = "F8_ENROLL_REV_" + suffix;
  const ref = db.doc("athletes/" + id);
  await ref.set({
    locationId: "lompoc", primaryDiscipline: "wrestling",
    activeDiscipline: "wrestling", disciplineIds: ["wrestling", "boxing"],
    disciplines: { wrestling: { locationId: "lompoc" }, boxing: { locationId: "lompoc" } },
  });
  const event = {
    params: { intakeId: "history-revision-test-" + suffix },
    data: {
      before: { data: () => ({ status: "submitted" }) },
      after: { data: () => ({
        status: "approved", mode: "new_athlete", minted: true,
        approvedUid: id, locationId: "santa-ynez-valley",
      }) },
    },
  };
  await normalizeEnrollment.run(event);
  const athlete = (await ref.get()).data();
  assert.equal(athlete.locationId, "santa-ynez-valley");
  assert.equal(athlete.disciplines.wrestling.locationId, "santa-ynez-valley");
  assert.equal(athlete.disciplines.boxing.locationId, "lompoc");
  for (const discipline of ["wrestling", "boxing"]) {
    assert.equal((await ref.collection("historyRevisions").doc(discipline).get()).get("revision"), 1);
  }
  await normalizeEnrollment.run(event);
  for (const discipline of ["wrestling", "boxing"]) {
    assert.equal((await ref.collection("historyRevisions").doc(discipline).get()).get("revision"), 1,
      "identical event delivery must not invalidate a second time");
  }
});
