"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RANK_META = void 0;
/**
 * Path2Legend uses one rank doctrine across all disciplines.
 *
 * Grappling:
 * white → blue → purple → brown → black
 *
 * Striking:
 * gray → blue → purple → brown → black
 */
const PATH2LEGEND_GRAPPLING = {
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
const PATH2LEGEND_STRIKING = {
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
const QUEST2MASTERY = {
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
const ROAD2CHAMPION = {
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
exports.RANK_META = {
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
