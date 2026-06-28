"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.placementXpForYears = placementXpForYears;
function placementXpForYears(yearsExperience) {
    const years = Number(yearsExperience || 0);
    if (years >= 3)
        return 600;
    if (years === 2)
        return 400;
    if (years === 1)
        return 200;
    return 0;
}
