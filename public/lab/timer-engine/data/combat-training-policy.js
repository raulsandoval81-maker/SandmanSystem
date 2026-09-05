export const COMBAT_TRAINING_TIMING = Object.freeze({
  road2champion: Object.freeze({
    t0: Object.freeze({ rankName: "Shadow", roundDuration: 45 }),
    t1: Object.freeze({ rankName: "Prospect", roundDuration: 60 }),
    t2: Object.freeze({ rankName: "Competitor", roundDuration: 75 }),
    t3: Object.freeze({ rankName: "Contender", roundDuration: 90 }),
    t4: Object.freeze({ rankName: "Champion", roundDuration: 120 })
  }),
  path2legend: Object.freeze({
    t0: Object.freeze({ rankName: "Apprentice", roundDuration: 60 }),
    t1: Object.freeze({ rankName: "Warrior", roundDuration: 90 }),
    t2: Object.freeze({ rankName: "Hero", roundDuration: 120 }),
    t3: Object.freeze({ rankName: "Veteran", roundDuration: 120 }),
    t4: Object.freeze({ rankName: "Legend", roundDuration: 180 })
  })
});

export const COMBAT_TRAINING_DEFAULTS = Object.freeze({
  prerollDuration: 5,
  restDuration: 30,
  shortTimeAt: 10
});
