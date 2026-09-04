"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PASSING_SCORE = void 0;
exports.requiredStripes = requiredStripes;
const f8ProgressionPolicy_1 = require("../../policy/f8ProgressionPolicy");
exports.PASSING_SCORE = 85;
function requiredStripes(programCode) {
    if (programCode === "F8") {
        return f8ProgressionPolicy_1.F8_STRIPES_PER_RANK;
    }
    return 4;
}
