"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendParentSignal = sendParentSignal;
const writeParentInbox_1 = require("./writeParentInbox");
const buildParentMessage_1 = require("./buildParentMessage");
async function sendParentSignal(input) {
    const built = (0, buildParentMessage_1.buildParentMessage)({
        type: input.type,
        athleteName: input.athleteName,
        testingDate: input.testingDate,
        nextTier: input.nextTier,
        note: input.note,
    });
    return (0, writeParentInbox_1.writeParentInbox)({
        parentUid: input.parentUid,
        athleteId: input.athleteId,
        athleteName: input.athleteName,
        type: input.type,
        title: built.title,
        message: built.message,
        source: input.source,
        sourceId: input.sourceId,
    });
}
