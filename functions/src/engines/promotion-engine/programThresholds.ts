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

export const PROGRAM_THRESHOLDS: Record<string, Program> = {
  F8: {
    name: "Foundry 8 • Zero2Hero",
    tiers: [
      { tier: 0, trainingShirt: "White Shirt", workingTowardBelt: "White Belt", earnedBeltAfterPass: "White Belt", xp: 600, stripesRequired: 3 },
      { tier: 1, trainingShirt: "Yellow Shirt", workingTowardBelt: "Yellow Belt", earnedBeltAfterPass: "Yellow Belt", xp: 800, stripesRequired: 4 },
      { tier: 2, trainingShirt: "Orange Shirt", workingTowardBelt: "Orange Belt", earnedBeltAfterPass: "Orange Belt", xp: 1000, stripesRequired: 4 },
      { tier: 3, trainingShirt: "Green Shirt", workingTowardBelt: "Green Belt", earnedBeltAfterPass: "Green Belt", xp: 1200, stripesRequired: 4 },
      { tier: 4, trainingShirt: "Blue Shirt", workingTowardBelt: "Blue Belt", earnedBeltAfterPass: "Blue Belt", xp: 1400, stripesRequired: 4 },
      { tier: 5, trainingShirt: "Purple Shirt", workingTowardBelt: "Purple Belt", earnedBeltAfterPass: "Purple Belt", xp: 1600, stripesRequired: 4 },
      { tier: 6, trainingShirt: "Brown Shirt", workingTowardBelt: "Brown Belt", earnedBeltAfterPass: "Brown Belt", xp: 1800, stripesRequired: 4 },
      { tier: 7, trainingShirt: "Black Shirt", workingTowardBelt: "Black Belt", earnedBeltAfterPass: "Black Belt", xp: 2400, stripesRequired: 4 }
    ]
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