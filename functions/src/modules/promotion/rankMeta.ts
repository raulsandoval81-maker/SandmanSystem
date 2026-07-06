export type Base = "F4" | "F8";
export type ProgramKind = "wrestling" | "boxing" | "mma" | "youth";

export const RANK_META: Record<
  ProgramKind,
  Partial<Record<Base, Record<string, { rankName: string; rankColor: string }>>>
> = {
  wrestling: {
    F4: {
      T0: { rankName: "Apprentice", rankColor: "white" },
      T1: { rankName: "Warrior", rankColor: "blue" },
      T2: { rankName: "Champion", rankColor: "purple" },
      T3: { rankName: "Veteran", rankColor: "brown" },
      T4: { rankName: "Legend", rankColor: "black" },
    },
  },

  boxing: {
    F4: {
      T0: { rankName: "Apprentice", rankColor: "gray" },
      T1: { rankName: "Warrior", rankColor: "blue" },
      T2: { rankName: "Champion", rankColor: "purple" },
      T3: { rankName: "Veteran", rankColor: "brown" },
      T4: { rankName: "Craftsman", rankColor: "black" },
    },
  },

  mma: {
    F4: {
      T0: { rankName: "Apprentice", rankColor: "gray" },
      T1: { rankName: "Warrior", rankColor: "blue" },
      T2: { rankName: "Champion", rankColor: "purple" },
      T3: { rankName: "Veteran", rankColor: "brown" },
      T4: { rankName: "Master", rankColor: "black" },
    },
  },

  youth: {
    F8: {
      T0: { rankName: "Shadow", rankColor: "white" },
      T1: { rankName: "Recruit", rankColor: "yellow" },
      T2: { rankName: "Competitor", rankColor: "orange" },
      T3: { rankName: "Contender", rankColor: "green" },
      T4: { rankName: "Warrior", rankColor: "blue" },
      T5: { rankName: "Champion", rankColor: "purple" },
      T6: { rankName: "Commander", rankColor: "brown" },
      T7: { rankName: "Hero", rankColor: "black" },
    },
  },
};