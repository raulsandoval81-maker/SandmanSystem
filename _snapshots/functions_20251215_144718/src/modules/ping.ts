import * as functions from "firebase-functions";
export const ping = functions.https.onRequest((_, res) => { res.status(200).send("pong"); });
