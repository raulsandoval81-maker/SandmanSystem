// functions/src/infra/admin.ts
import * as admin from "firebase-admin";

if (!admin.apps.length) admin.initializeApp();

export { admin };
export const db = admin.firestore();
export const FieldValue = admin.firestore.FieldValue;
export const Timestamp = admin.firestore.Timestamp;
