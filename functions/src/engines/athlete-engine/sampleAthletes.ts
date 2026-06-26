export interface Athlete {

  id: string;

  name: string;

  programCode: string;

  programName: string;

  team: string;

  xp: number;

  tier: number;

  stripe: number;

  coach: string;

  certificates: string[];

}

export const SAMPLE_ATHLETES: Athlete[] = [

  {

    id: "F8_0001",

    name: "L. Sampson Sandoval",

    programCode: "F8",

    programName: "Foundry 8 • Zero2Hero",

    team: "LAW",

    xp: 650,

    tier: 0,

    stripe: 1,

    coach: "Coach Sandoval",

    certificates: []

  },

  {

    id: "F4_0001",

    name: "M. Sandoval",

    programCode: "F4",

    programName: "Foundry 4 • Path2Legend",

    team: "LAW",

    xp: 735,

    tier: 0,

    stripe: 0,

    coach: "Coach Sandoval",

    certificates: []

  }

];