"use strict";
// functions/src/caps.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.CAPS_EVENTS = exports.DELTAS = void 0;
// Per-event point changes
exports.DELTAS = {
    attendance: 10,
    fish: -5,
    tournament_show: 15,
    style_bonus: 5,
};
// Max count for each event type per month
exports.CAPS_EVENTS = {
    attendance: 12, // 12 practices
    fish: 4, // penalty at most 4 times
    tournament_show: 2, // 2 tournaments
    style_bonus: 2, // 2 style bonuses
};
