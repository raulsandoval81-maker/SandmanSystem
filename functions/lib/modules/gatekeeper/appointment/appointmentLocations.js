"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isSupportedLocation = isSupportedLocation;
exports.getLocationName = getLocationName;
exports.getLocationAddress = getLocationAddress;
function isSupportedLocation(location) {
    return (location === "lompoc" ||
        location === "santa-ynez-valley" ||
        location === "elk-grove");
}
function getLocationName(location) {
    const names = {
        lompoc: "Lompoc",
        "santa-ynez-valley": "Santa Ynez Valley",
        "elk-grove": "Elk Grove"
    };
    return names[location];
}
function getLocationAddress(location) {
    if (location === "lompoc") {
        return [
            "Lompoc High School Wrestling Room — Room IA-1",
            "515 W College Ave",
            "Lompoc, CA 93436"
        ].join("\n");
    }
    if (location === "elk-grove") {
        return [
            "Location details will be confirmed",
            "by the academy team."
        ].join("\n");
    }
    return [
        "320 Alisal Road",
        "Suite 106",
        "Solvang, CA 93463"
    ].join("\n");
}
