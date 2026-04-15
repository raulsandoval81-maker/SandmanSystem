"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.addCoachNote = void 0;
// functions/src/modules/notes/addCoachNote.ts
const https_1 = require("firebase-functions/v2/https");
const addCoachNoteCore_1 = require("./addCoachNoteCore");
exports.addCoachNote = (0, https_1.onCall)(async (req) => {
    try {
        const data = (req.data || {});
        return await (0, addCoachNoteCore_1.handleAddCoachNote)(data, {
            authUid: req.auth?.uid ?? null,
        });
    }
    catch (err) {
        console.error("[addCoachNote] crash:", err);
        throw new https_1.HttpsError("invalid-argument", err?.message || "note error");
    }
});
