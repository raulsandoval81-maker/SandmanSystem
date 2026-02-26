"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ping = void 0;
const https_1 = require("firebase-functions/v2/https");
exports.ping = (0, https_1.onRequest)((req, res) => {
    res.status(200).send({ ok: true, msg: "pong", ts: Date.now() });
});
