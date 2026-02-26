import * as admin from "firebase-admin";
import { onRequest } from "firebase-functions/v2/https";

if (!admin.apps.length) admin.initializeApp();

export const ping = onRequest((req, res) => {
  res.status(200).send("pong");
});
