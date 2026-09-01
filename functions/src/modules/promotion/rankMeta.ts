export type Base = "F4" | "F8";

export type ProgramKind =
  | "wrestling"
  | "submission-grappling"
  | "boxing"
  | "kickboxing"
  | "mma"
  | "youth";

export type RankMetaEntry = {
  rankName: string;
  rankColor: string;
};

export type RankLadder =
  Record<string, RankMetaEntry>;

export type ProgramRankMeta =
  Partial<Record<Base, RankLadder>>;

/**
 * Path2Legend uses one rank doctrine across all disciplines.
 *
 * Grappling:
 * white → blue → purple → brown → black
 *
 * Striking:
 * gray → blue → purple → brown → black
 */
const PATH2LEGEND_GRAPPLING: RankLadder = {
  T0: {
    rankName: "Apprentice",
    rankColor: "white",
  },
  T1: {
    rankName: "Warrior",
    rankColor: "blue",
  },
  T2: {
    rankName: "Champion",
    rankColor: "purple",
  },
  T3: {
    rankName: "Veteran",
    rankColor: "brown",
  },
  T4: {
    rankName: "Legend",
    rankColor: "black",
  },
};

const PATH2LEGEND_STRIKING: RankLadder = {
  T0: {
    rankName: "Apprentice",
    rankColor: "gray",
  },
  T1: {
    rankName: "Warrior",
    rankColor: "blue",
  },
  T2: {
    rankName: "Champion",
    rankColor: "purple",
  },
  T3: {
    rankName: "Veteran",
    rankColor: "brown",
  },
  T4: {
    rankName: "Legend",
    rankColor: "black",
  },
};

/**
 * Quest2Mastery is MMA only.
 *
 * Apprentice → Champion → Veteran → Master
 */
const QUEST2MASTERY: RankLadder = {
  T0: {
    rankName: "Apprentice",
    rankColor: "gray",
  },
  T1: {
    rankName: "Champion",
    rankColor: "purple",
  },
  T2: {
    rankName: "Veteran",
    rankColor: "brown",
  },
  T3: {
    rankName: "Master",
    rankColor: "black",
  },
};

/**
 * Road2Champion youth progression metadata.
 * Curriculum remains independently routed through the legacy T0–T7 tree.
 */
const ROAD2CHAMPION: RankLadder = {
  T0: {
    rankName: "Shadow",
    rankColor: "white",
  },
  T1: {
    rankName: "Prospect",
    rankColor: "yellow",
  },
  T2: {
    rankName: "Competitor",
    rankColor: "orange",
  },
  T3: {
    rankName: "Contender",
    rankColor: "green",
  },
  T4: {
    rankName: "Champion",
    rankColor: "black",
  },
};

export const RANK_META: Record<
  ProgramKind,
  ProgramRankMeta
> = {
  wrestling: {
    F4: PATH2LEGEND_GRAPPLING,
  },

  "submission-grappling": {
    F4: PATH2LEGEND_GRAPPLING,
  },

  boxing: {
    F4: PATH2LEGEND_STRIKING,
  },

  kickboxing: {
    F4: PATH2LEGEND_STRIKING,
  },

  mma: {
    F4: QUEST2MASTERY,
  },

  youth: {
    F8: ROAD2CHAMPION,
  },
};
