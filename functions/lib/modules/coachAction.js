"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.coachAction = void 0;
const https_1 = require("firebase-functions/v2/https");
exports.coachAction = (0, https_1.onRequest)((_req, res) => {
    res.status(410).json({
        ok: false,
        error: "Legacy Coach action endpoint disabled. Use the authorized testing callables.",
    });
});
