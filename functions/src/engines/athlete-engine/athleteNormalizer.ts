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

  xp: number;

  xpCap: number;

  coachUid: string;

  coach: string;

  rankName: string;

  rankColor: string;

  certificates: string[];

}

export function normalizeAthlete(doc: any): EngineAthlete {

  const tierNumber = Number(
    String(doc.tier || "T0").replace("T", "")
  );

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

    stripe: doc.stripeCount ?? 0,

    xp: doc.xp ?? 0,

    xpCap: doc.xpCap ?? 0,

    coachUid: doc.coachUid ?? "",

    coach: doc.coachName || doc.coach || "Coach Sandoval",

    rankName: doc.rankName || "",

    rankColor: doc.rankColor || "",

    certificates: doc.certificates ?? []

  };

}