import {
  F8_RANKS,
  F8_STRIPES_PER_RANK,
} from "../../policy/f8ProgressionPolicy";

export interface Tier {
  tier: number;
  trainingShirt: string;
  workingTowardBelt: string;
  earnedBeltAfterPass: string;
  xp: number;
  stripesRequired: number;
}

export interface Program {
  name: string;
  tiers: Tier[];
}

const F8_TIER_PRESENTATION = Object.freeze({
  T0: Object.freeze({ trainingShirt: "White Shirt", workingTowardBelt: "White Belt", earnedBeltAfterPass: "White Belt" }),
  T1: Object.freeze({ trainingShirt: "Yellow Shirt", workingTowardBelt: "Yellow Belt", earnedBeltAfterPass: "Yellow Belt" }),
  T2: Object.freeze({ trainingShirt: "Orange Shirt", workingTowardBelt: "Orange Belt", earnedBeltAfterPass: "Orange Belt" }),
  T3: Object.freeze({ trainingShirt: "Green Shirt", workingTowardBelt: "Green Belt", earnedBeltAfterPass: "Green Belt" }),
  T4: Object.freeze({ trainingShirt: "Black Shirt", workingTowardBelt: "Black Belt", earnedBeltAfterPass: "Black Belt" }),
});

const F8_TIERS: Tier[] = F8_RANKS.map((rank) => ({
  tier: Number(rank.tier.slice(1)),
  ...F8_TIER_PRESENTATION[rank.tier],
  xp: rank.xpCap,
  stripesRequired: F8_STRIPES_PER_RANK,
}));

export const PROGRAM_THRESHOLDS: Record<string, Program> = {
  F8: {
    name: "Foundry 8 • Zero2Hero",
    tiers: F8_TIERS,
  },

  F4: {
    name: "Foundry 4 • Path2Legend",
    tiers: [
      { tier: 0, trainingShirt: "White Shirt", workingTowardBelt: "White Belt", earnedBeltAfterPass: "White Belt", xp: 1000, stripesRequired: 4 },
      { tier: 1, trainingShirt: "Blue Shirt", workingTowardBelt: "Blue Belt", earnedBeltAfterPass: "Blue Belt", xp: 1600, stripesRequired: 4 },
      { tier: 2, trainingShirt: "Purple Shirt", workingTowardBelt: "Purple Belt", earnedBeltAfterPass: "Purple Belt", xp: 2000, stripesRequired: 4 },
      { tier: 3, trainingShirt: "Brown Shirt", workingTowardBelt: "Brown Belt", earnedBeltAfterPass: "Brown Belt", xp: 2400, stripesRequired: 4 },
      { tier: 4, trainingShirt: "Black Shirt", workingTowardBelt: "Black Belt", earnedBeltAfterPass: "Black Belt", xp: 3000, stripesRequired: 4 }
    ]
  }
};
