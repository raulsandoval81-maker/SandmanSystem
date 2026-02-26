// eslint-disable-next-line @typescript-eslint/no-unused-vars
// @ts-ignore

import { onCall } from "firebase-functions/v2/https";

export const activateAthlete = onCall(async (request) => {
  return { ok: true, status: "noop-dev" };
});
