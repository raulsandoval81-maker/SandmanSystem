import { onRequest } from "firebase-functions/v2/https";

export const ping = onRequest((req, res) => {
  res.status(200).send("pong");
});
