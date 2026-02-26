// Belt Palette – shared across Youth + Teen/Foundry4 ladders

// Shared colors (identical for ranks with same name)
const WARRIOR  = { text:"#FFFFFF", bandStart:"#2196F3", bandEnd:"#0D47A1", outline:"#000000" }; // blue
const CHAMPION = { text:"#FFFFFF", bandStart:"#9C27B0", bandEnd:"#4A148C", outline:"#000000" }; // purple

export const BELT_YOUTH = {
  Shadow:         { text:"#000000", bandStart:"#FFFFFF", bandEnd:"#EAEAEA", outline:"#000000" }, // white w/ black text
  Recruit:        { text:"#FFFFFF", bandStart:"#FFD54F", bandEnd:"#FFA000", outline:"#000000" }, // yellow/gold
  Combatant:      { text:"#FFFFFF", bandStart:"#FF7043", bandEnd:"#D84315", outline:"#000000" }, // orange
  Competitor:     { text:"#FFFFFF", bandStart:"#4CAF50", bandEnd:"#1B5E20", outline:"#000000" }, // green
  Warrior:        WARRIOR,   // same as Teen
  Champion:       CHAMPION,  // same as Teen
  Commander:      { text:"#FFFFFF", bandStart:"#6D4C41", bandEnd:"#3E2723", outline:"#000000" }, // dark brown
  Sandman:        { text:"#000000", bandStart:"#FFD700", bandEnd:"#FFC107", outline:"#000000" }, // Sandman gold
  "Junior Legend":{ text:"#FFFFFF", bandStart:"#000000", bandEnd:"#000000", outline:"#FFFFFF" }  // black
};

export const BELT_F4 = {
  Apprentice:     { text:"#000000", bandStart:"#FFFFFF", bandEnd:"#EAEAEA", outline:"#000000" }, // white
  Warrior:        WARRIOR,   // same as Youth
  Champion:       CHAMPION,  // same as Youth
  Veteran:        { text:"#FFFFFF", bandStart:"#6D4C41", bandEnd:"#3E2723", outline:"#000000" }, // brown
  Legend:         { text:"#FFFFFF", bandStart:"#000000", bandEnd:"#000000", outline:"#FFFFFF" }  // solid black
};
export function colorKeyFor(tierName = "") {
  const t = String(tierName).toLowerCase().trim();
  // Normalize known aliases
  const map = {
    "junior legend": "juniorLegend",
    "jr legend": "juniorLegend",
  };
  return map[t] || t.replace(/\s+/g, "");
}

// Helper to build the gradient style string for a given tier name.
export function beltStyleFor(tierName) {
  const key = colorKeyFor(tierName);
  const c = COLORS[key] || COLORS.apprentice;
  return `
    --text:${c.text};
    --start:${c.start};
    --end:${c.end};
    --outline:${c.outline};
    color:${c.text};
    background:linear-gradient(90deg, ${c.start}, ${c.end});
    border:2px solid ${c.outline};
  `;
}