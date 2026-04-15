import * as functions from "firebase-functions";

export const onTestResult = functions.firestore
  .document("users/{uid}/xp/{track}/tests/{testId}")
  .onWrite(async (change, ctx) => {
    console.log("onTestResult fired", ctx.params);
    return;
  });
