export interface EngineAthlete {
  id: string;
  uid: string;

  name: string;
  fullName: string;

  team: string;

  programCode: string;
  programName: string;

  tier: number;
  tierCode: string;

  stripe: number;
  stripeCount: number; // ✅ FIXED: required for recognition engine

  xp: number;
  xpCap: number;

  coachUid: string;
  coach: string;

  rankName: string;
  rankColor: string;

  rosterStatus?: string;

  isDev?: boolean;
  devMode?: boolean;
  isTest?: boolean;

  certificates: string[];
}

export function normalizeAthlete(doc: any): EngineAthlete {
  const tierNumber = Number(
    String(doc.tier || "T0").replace("T", "")
  );

  let programCode = "UNKNOWN";
  let programName = "Unknown";

  const athleteId = String(
    doc.uidCode || doc.uid || ""
  ).toUpperCase();

  const programMarkers = [
    doc.trackBase,
    doc.track,
    doc.programTrack,
    doc.trackCode,
    doc.journey,
    doc.program
  ]
    .map((value) => String(value ?? "").toUpperCase())
    .join(" ");

  const isF8 =
    athleteId.startsWith("F8_") ||
    /(^|\\W)F8(\\W|$)|FOUNDRY8|ZERO2HERO|YOUTH/.test(programMarkers);

  const isF4 =
    athleteId.startsWith("F4_") ||
    /(^|\\W)F4(\\W|$)|FOUNDRY4|PATH2LEGEND|TEEN/.test(programMarkers);

  if (isF8 && !isF4) {
    programCode = "F8";
    programName = "Foundry 8 • Zero2Hero";
  }

  if (isF4 && !isF8) {
    programCode = "F4";
    programName = "Foundry 4 • Path2Legend";
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