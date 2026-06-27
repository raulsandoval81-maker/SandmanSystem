"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PASSING_SCORE = void 0;
exports.requiredStripes = requiredStripes;
exports.PASSING_SCORE = 85;
function requiredStripes(programCode) {
    if (programCode === "F8") {
        return 3;
    }
    return 4;
}
