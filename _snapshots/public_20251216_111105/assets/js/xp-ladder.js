// public/assets/js/xp-ladder.js
// Display metadata: tier names + colors (no math here)

export const LADDER = Object.freeze({
  foundry4: {
    order: ["T0","T1","T2","T3","T4"],
    names: {
      T0: "Apprentice",
      T1: "Warrior",
      T2: "Champion",
      T3: "Veteran",
      T4: "Legend"
    },
    colors: {         // UI accent color per rank name
      Apprentice: "#ffffff",
      Warrior:    "#007aff",
      Champion:   "#af52de",
      Veteran:    "#8e6b3a",
      Legend:     "#111111"
    }
  },

  foundry8: {
    order: ["T0","T1","T2","T3","T4","T5","T6","T7","T8"],
    names: {
      T0: "Shadow",
      T1: "Recruit",
      T2: "Combatant",
      T3: "Competitor",
      T4: "Warrior",
      T5: "Champion",
      T6: "Veteran",
      T7: "Sandman",
      T8: "Hero"
    },
    colors: {
      Shadow:     "#ffffff",
      Recruit:    "#ffd633",
      Combatant:  "#ff9f1a",
      Competitor: "#35c759",
      Warrior:    "#007aff",
      Champion:   "#af52de",
      Veteran:    "#8e6b3a",
      Sandman:    "#ffd700",
      Hero:       "#111111"
    }
  }
});

