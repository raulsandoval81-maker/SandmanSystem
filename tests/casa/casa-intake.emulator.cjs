const {test} = require("node:test");
const assert = require("node:assert/strict");
const {readFileSync} = require("node:fs");
const {initializeTestEnvironment, assertSucceeds, assertFails} = require("@firebase/rules-unit-testing");
const {collection, doc, getDoc, getDocs, setDoc, serverTimestamp, updateDoc} = require("firebase/firestore");

test("Casa national and existing public inquiries enforce the Admin Reception contract", async t => {
  assert.ok(process.env.FIRESTORE_EMULATOR_HOST, "This suite requires the emulator");
  const {generalMessagePayload} = await import("../../public/connect/general-message-payload.mjs");
  const env = await initializeTestEnvironment({
    projectId: "demo-sandman-casa",
    firestore: {rules: readFileSync("firestore.rules", "utf8")}
  });
  try {
    await env.withSecurityRulesDisabled(async context => {
      for (const [uid, role] of [["admin", "admin"], ["manager", "location_manager"]]) {
        await setDoc(doc(context.firestore(), "staff", uid), {role, status: "active"});
      }
    });
    const writer = env.authenticatedContext("synthetic-sender", {firebase: {sign_in_provider: "anonymous"}}).firestore();
    const admin = env.authenticatedContext("admin").firestore();
    const manager = env.authenticatedContext("manager").firestore();
    const guest = env.unauthenticatedContext().firestore();
    const inquiry = (topic, source = "casa-national-site") => generalMessagePayload({
      contactName: "Synthetic Casa", email: "casa@example.test", message: "Synthetic staging inquiry",
      topic, contactConsent: true, language: "en", pagePath: "/connect/casa/"
    }, serverTimestamp, source);
    const entry = (db, id) => doc(db, "general_messages", id);

    await t.test("all six Casa classifications are visible to Admin and remain unassigned", async () => {
      for (const topic of ["academy", "combat", "fitness", "partnership", "expansion", "general"]) {
        await assertSucceeds(setDoc(entry(writer, topic), inquiry("casa-" + topic)));
        const record = (await assertSucceeds(getDoc(entry(admin, topic)))).data();
        assert.equal(record.source, "casa-national-site");
        assert.equal(record.topic, "casa-" + topic);
        assert.equal(record.routingStage, "ADMIN_REVIEW");
        assert.equal(record.assignmentStatus, "UNASSIGNED");
        for (const key of ["organizationId", "academyId", "locationId", "assignedAdminUid", "assignedManagerUid", "assignedCoachUid"]) {
          assert.equal(record[key], null);
        }
      }
    });

    await t.test("invalid shape, consent, classification and local routing are denied", async () => {
      const valid = inquiry("casa-academy");
      const cases = [
        {...valid, contactConsent: false}, {...valid, topic: "unknown"}, {...valid, extraField: true},
        {...valid, email: "invalid"}, {...valid, message: ""}, {...valid, assignedManagerUid: "manager"},
        {...valid, passType: "paid"}, {...valid, preferredLocation: "santa-ynez-valley"},
        {...valid, routingStage: "MANAGEMENT_TRIAGE", nextRoutingStage: "COACH_ASSIGNED",
          routingPolicy: "LOCAL_TO_LOCATION_MANAGER", assignmentStatus: "PENDING_MANAGEMENT",
          preferredOrganization: "sandman-academy", preferredLocation: "santa-ynez-valley",
          organizationId: "sandman-academy", organizationName: "Sandman Academy of Combat & Fitness",
          academyId: "sandman-academy", academyName: "Sandman Academy of Combat & Fitness",
          locationId: "santa-ynez-valley", locationName: "Santa Ynez Valley"}
      ];
      for (const [index, payload] of cases.entries()) await assertFails(setDoc(entry(writer, "invalid-" + index), payload));
      await assertFails(setDoc(entry(guest, "anonymous-without-sign-in"), valid));
    });

    await t.test("sender and local Management cannot read or route national inquiries", async () => {
      for (const db of [writer, manager, guest]) {
        await assertFails(getDoc(entry(db, "academy")));
        await assertFails(getDocs(collection(db, "general_messages")));
        await assertFails(updateDoc(entry(db, "academy"), {assignedManagerUid: "manager"}));
      }
    });

    await t.test("existing public writer still reaches Admin", async () => {
      await assertSucceeds(setDoc(entry(guest, "public"), inquiry("other", "public-message-page")));
      const messages = await assertSucceeds(getDocs(collection(admin, "general_messages")));
      assert.equal(messages.size, 7);
      assert.equal(messages.docs.find(item => item.id === "public").data().source, "public-message-page");
    });
  } finally {
    await env.cleanup();
  }
});
