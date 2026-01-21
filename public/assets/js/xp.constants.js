// public/js/xp.constants.js
export const XP_RULES = {
  practice: {
    attendance: { label: "Attendance", delta: +10, capPerMonth: 120 },
    fish:       { label: "Fish (decay)", delta: -5, capPerMonth: 4 },
  },
  tournament: {
    show:       { label: "Show", delta: +15, capPerMonth: 2 }, // ✅ cap 2/mo
  },
  style: {
    shark:      { label: "Shark (style)", delta: +5, capPerMonth: 2 },
    bull:       { label: "Bull", delta: +5, capPerMonth: 2 },
    matador:    { label: "Matador", delta: +5, capPerMonth: 2 },
    snake:      { label: "Snake", delta: +5, capPerMonth: 2 },
    mongoose:   { label: "Mongoose", delta: +5, capPerMonth: 2 },
    gorilla:    { label: "Gorilla", delta: +5, capPerMonth: 2 },
  },
};
