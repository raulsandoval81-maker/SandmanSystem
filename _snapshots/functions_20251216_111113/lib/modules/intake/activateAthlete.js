"use strict";
// eslint-disable-next-line @typescript-eslint/no-unused-vars
// @ts-ignore
Object.defineProperty(exports, "__esModule", { value: true });
exports.activateAthlete = void 0;
const https_1 = require("firebase-functions/v2/https");
exports.activateAthlete = (0, https_1.onCall)(async (request) => {
    return { ok: true, status: "noop-dev" };
});
