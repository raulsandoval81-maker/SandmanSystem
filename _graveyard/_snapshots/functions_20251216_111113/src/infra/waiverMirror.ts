import * as admin from "firebase-admin";


/**
* Mirror waiver metadata into Firestore for forensics/audit.
* Keep path stable for analytics: /waiverUploads/{uid}/{YYYY}/{MM}/{fileName}
*/
export type MirrorInput = {
uid: string;
fileName: string;
gsPath: string;
size: number;
contentType: "application/pdf";
year: string; // "2025"
month: string; // "10"
uploadedBy: string | null;
uploadedAt?: admin.firestore.FieldValue;
};


export async function writeWaiverMirror(input: MirrorInput) {
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