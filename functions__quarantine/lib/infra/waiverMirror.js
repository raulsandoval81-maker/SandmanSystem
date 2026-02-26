"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.writeWaiverMirror = writeWaiverMirror;
const admin = __importStar(require("firebase-admin"));
async function writeWaiverMirror(input) {
    const { uid, year, month, fileName, ...rest } = input;
    const db = admin.firestore();
    const docRef = db
        .collection("waiverUploads")
        .doc(uid)
        .collection(year)
        .doc(month)
        .collection("files")
        .doc(fileName);
    await docRef.set({ fileName, ...rest }, { merge: true });
    // Optional: also keep a monthly flat log for quick admin scanning
    const bucketId = `${year}${month}`;
    const monthly = db.collection("adminLogs").doc("intake").collection(bucketId).doc();
    await monthly.set({
        scope: "waiver",
        action: "upload",
        uid,
        fileName,
        gsPath: rest.gsPath,
        size: rest.size,
        by: rest.uploadedBy || null,
        ts: admin.firestore.FieldValue.serverTimestamp(),
    });
}
