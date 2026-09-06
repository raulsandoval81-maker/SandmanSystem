export const COMBAT_TRAINING_TIMING = Object.freeze({
  road2champion: Object.freeze({
    t0: Object.freeze({ rankName: "Shadow", roundDuration: 45, restDuration: 45 }),
    t1: Object.freeze({ rankName: "Prospect", roundDuration: 60, restDuration: 45 }),
    t2: Object.freeze({ rankName: "Competitor", roundDuration: 75, restDuration: 45 }),
    t3: Object.freeze({ rankName: "Contender", roundDuration: 90, restDuration: 45 }),
    t4: Object.freeze({ rankName: "Champion", roundDuration: 120, restDuration: 60 })
  }),
  path2legend: Object.freeze({
    t0: Object.freeze({ rankName: "Apprentice", roundDuration: 60, restDuration: 60 }),
    t1: Object.freeze({ rankName: "Warrior", roundDuration: 90, restDuration: 60 }),
    t2: Object.freeze({ rankName: "Hero", roundDuration: 120, restDuration: 60 }),
    t3: Object.freeze({ rankName: "Veteran", roundDuration: 120, restDuration: 60 }),
    t4: Object.freeze({ rankName: "Legend", roundDuration: 180, restDuration: 60 })
  })
});

export const COMBAT_TRAINING_DEFAULTS = Object.freeze({
  prerollDuration: 5,
  shortTimeAt: 10,
  sessionCycles: 2,
  recovery: Object.freeze({
    label: "Jump Rope",
    spokenCommand: "Jump rope",
    coachingCue: "Shadow rope. Stay moving, breathe, and prepare for the next round."
  })
});

/*
  Future XP adapter policy — documentation only, not enforced here:
  eligible completed Shadow Session +5 Combat XP; maximum 2 eligible sessions/week;
  maximum 40 Combat XP/month at every tier. Extra training earns no additional XP.
  T4 earns the same +5. Future 60-minute work remains a separate +10 category.
*/
