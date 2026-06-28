"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createTestingEvent = createTestingEvent;
const firestore_1 = require("firebase-admin/firestore");
async function createTestingEvent(payload) {
    const db = (0, firestore_1.getFirestore)();
    const event = {
        uid: payload.uid,
        type: payload.type,
        score: payload.score ?? null,
        tier: payload.tier ?? null,
        nextTier: payload.nextTier ?? null,
        scheduledDate: payload.scheduledDate ?? null,
        coachUid: payload.coachUid ?? null,
        parentUid: payload.parentUid ?? null,
        publicName: payload.publicName ?? null,
        createdAt: firestore_1.FieldValue.serverTimestamp()
    };
    const ref = await db.collection("testingEvents").add(event);
    return {
        id: ref.id,
        ...event
    };
}
