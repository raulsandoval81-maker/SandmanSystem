// xp-ladder.js

export const LADDER = Object.freeze({
  foundry4: {
    order: ["T0", "T1", "T2", "T3", "T4"],
    names: {
      T0: "Apprentice",
      T1: "Warrior",
      T2: "Champion",
      T3: "Veteran",
      T4: "Legend",
    },
    colors: {
      Apprentice: "#ffffff", // White
      Warrior:   "#007aff",  // Blue
      Champion:  "#af52de",  // Purple
      Veteran:   "#8e6b3a",  // Brown
      Legend:    "#111111",  // Black
    },
  },

  // ✅ ADD THIS
  foundry4Adult: {
    order: ["T0", "T1", "T2", "T3", "T4"],
    names: {
      T0: "Foundation",
      T1: "Development",
      T2: "Integration",
      T3: "Refinement",
      T4: "Mastery",
    },
    colors: {
      Foundation:  "#ffffff", // White
      Development: "#007aff", // Blue
      Integration: "#af52de", // Purple
      Refinement:  "#8e6b3a", // Brown
      Mastery:     "#111111", // Black
    },
  },

  foundry8: {
    order: ["T0","T1","T2","T3","T4","T5","T6","T7"],
    names: {
      T0: "Shadow",
      T1: "Recruit",
      T2: "Combatant",
      T3: "Competitor",
      T4: "Warrior",
      T5: "Champion",
      T6: "Commander",
      T7: "Hero",
    },
    colors: {
      Shadow:     "#ffffff",
      Recruit:    "#ffd633",
      Combatant:  "#ff9f1a",
      Competitor: "#35c759",
      Warrior:    "#007aff",
      Champion:   "#af52de",
      Commander:  "#8e6b3a",
      Hero:       "#111111",
    },
  },
});
