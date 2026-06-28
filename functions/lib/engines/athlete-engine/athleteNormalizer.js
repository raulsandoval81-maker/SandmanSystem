"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizeAthlete = normalizeAthlete;
function normalizeAthlete(doc) {
    const tierNumber = Number(String(doc.tier || "T0").replace("T", ""));
    let programCode = "UNKNOWN";
    let programName = "Unknown";
    if (doc.trackCode === "foundry4-combat") {
        programCode = "F4";
        programName = "Foundry 4 • Path2Legend";
    }
    if (doc.trackCode === "foundry8-combat") {
        programCode = "F8";
        programName = "Foundry 8 • Zero2Hero";
    }
    const stripeValue = doc.stripeCount ?? doc.stripe ?? 0;
    return {
        id: doc.uidCode || doc.uid,
        uid: doc.uid,
        name: doc.publicName || doc.name,
        fullName: doc.fullName || doc.publicName,
        team: doc.team,
        programCode,
        programName,
        tier: tierNumber,
        tierCode: doc.tier,
        // ✅ unified stripe model (fixes your error + stabilizes engine)
        stripe: stripeValue,
        stripeCount: stripeValue,
        xp: doc.xp ?? 0,
        xpCap: doc.xpCap ?? 0,
        coachUid: doc.coachUid ?? "",
        coach: doc.coachName || doc.coach || "Coach Sandoval",
        rankName: doc.rankName || "",
        rankColor: doc.rankColor || "",
        rosterStatus: doc.rosterStatus || "current",
        isDev: doc.isDev === true,
        devMode: doc.devMode === true,
        isTest: doc.isTest === true,
        certificates: doc.certificates ?? []
    };
}
