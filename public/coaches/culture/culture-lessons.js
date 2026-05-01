export const CULTURE_LESSONS = [

  {
    id: "standards-fear-01",
    category: "standards",
    title: "F.E.A.R",

    onmat: {
      line: "Focus. Effort. Attitude. Respect.",
      coach: "That’s our standard every day."
    },

    offmat: {
      reflect: "Did you bring focus, effort, attitude, and respect today?",
      close: "Those four decide who you become."
    },

    links: [
      "standards-focus-01",
      "standards-effort-01",
      "standards-attitude-01",
      "standards-respect-01"
    ]
  },

  {
    id: "standards-focus-01",
    category: "standards",
    title: "Focus",

    onmat: {
      line: "Eyes up. Mind here.",
      coach: "Lock in. One rep at a time."
    },

    offmat: {
      reflect: "Did you stay present or drift today?",
      close: "Focus is a choice every rep."
    },

    links: ["standards-effort-01"]
  },

  {
    id: "standards-effort-01",
    category: "standards",
    title: "Effort",

    onmat: {
      line: "Finish every rep.",
      coach: "No coasting. Go or don’t go."
    },

    offmat: {
      reflect: "Did you keep working when it got hard?",
      close: "Effort is a choice, not a feeling."
    },

    links: ["work-fulltime-01"]
  },

  {
    id: "standards-attitude-01",
    category: "standards",
    title: "Attitude",

    onmat: {
      line: "Positive body. Positive talk.",
      coach: "No complaining. Fix it and move."
    },

    offmat: {
      reflect: "How did you respond when things didn’t go your way?",
      close: "Attitude controls your direction."
    },

    links: ["standards-focus-01"]
  },

  {
    id: "standards-respect-01",
    category: "standards",
    title: "Respect",

    onmat: {
      line: "Respect the room.",
      coach: "Respect the coach, teammates, and work."
    },

    offmat: {
      reflect: "Did you carry yourself the right way today?",
      close: "Respect shows before skill."
    },

    links: ["system-honor-01"]
  },{
  id: "work-fulltime-01",
  category: "work",
  title: "Full-Time vs Part-Time",

  onmat: {
    line: "Full-time work beats part-time effort.",
    coach: "You don’t get better only when you feel like it."
  },

  offmat: {
    reflect: "Did you work full-time or part-time today?",
    close: "Consistency separates people."
  },

  links: ["standards-effort-01"]
},{
  id: "work-showup-01",
  category: "work",
  title: "Show Up",

  onmat: {
    line: "Be here every day.",
    coach: "You can’t improve if you’re not in the room."
  },

  offmat: {
    reflect: "Did you show up fully today?",
    close: "Showing up is the first win."
  },

  links: ["work-fulltime-01"]
},{
  id: "work-finish-01",
  category: "work",
  title: "Finish",

  onmat: {
    line: "Finish every rep, every drill.",
    coach: "Don’t leave work unfinished."
  },

  offmat: {
    reflect: "Did you finish what you started today?",
    close: "Finish builds confidence."
  },

  links: ["standards-effort-01"]
},{
  id: "work-noshortcuts-01",
  category: "work",
  title: "No Shortcuts",

  onmat: {
    line: "Do the full work.",
    coach: "Shortcuts slow you down long-term."
  },

  offmat: {
    reflect: "Did you try to cut corners today?",
    close: "Shortcuts cost you growth."
  },

  links: ["work-finish-01"]
},{
  id: "work-daily-01",
  category: "work",
  title: "Daily Work",

  onmat: {
    line: "Stack good days.",
    coach: "One good day doesn’t matter—stack them."
  },

  offmat: {
    reflect: "Did you put in real work today?",
    close: "Daily work builds long-term results."
  },

  links: ["work-showup-01"]
},{
  id: "identity-ccgm-01",
  category: "identity",
  title: "Creed • Code • Goal • Mission",

  onmat: {
    line: "Know who you are and what you're chasing.",
    coach: "Don’t just train. Train with purpose."
  },

  offmat: {
    reflect: "Did your actions match your Creed, Code, Goal, and Mission today?",
    close: "If you don’t define it, you drift."
  },

  links: ["identity-code-01", "identity-goal-01"]
},

{
  id: "identity-creed-01",
  category: "identity",
  title: "Creed",

  onmat: {
    line: "Your Creed is what you believe.",
    coach: "If you don’t know what you believe, pressure will decide for you."
  },

  offmat: {
    reflect: "Did your actions show what you believe today?",
    close: "Belief has to show up in behavior."
  },

  links: ["identity-code-01"]
},

{
  id: "identity-code-01",
  category: "identity",
  title: "Code",

  onmat: {
    line: "Your Code is how you act.",
    coach: "Standards mean nothing if you don’t live them."
  },

  offmat: {
    reflect: "Did you live by your Code today?",
    close: "Your Code shows before your talent does."
  },

  links: ["standards-fear-01", "identity-creed-01"]
},

{
  id: "identity-goal-01",
  category: "identity",
  title: "Goal",

  onmat: {
    line: "Train with a target.",
    coach: "If you don’t have a goal, you’ll waste reps."
  },

  offmat: {
    reflect: "Did your work move you toward your goal today?",
    close: "Goals give your work direction."
  },

  links: ["identity-mission-01"]
},

{
  id: "identity-mission-01",
  category: "identity",
  title: "Mission",

  onmat: {
    line: "Your Mission is your reason.",
    coach: "When the work gets hard, your reason has to stay bigger."
  },

  offmat: {
    reflect: "Did you remember your reason today?",
    close: "Mission keeps you moving when motivation fades."
  },

  links: ["identity-goal-01", "work-daily-01"]
},{
  id: "system-csh-01",
  category: "system",
  title: "Combat • Strength • Honor",

  onmat: {
    line: "Compete. Be strong. Do it right.",
    coach: "Every position is a fight. Handle it the right way."
  },

  offmat: {
    reflect: "Did you compete, stay strong, and act with honor today?",
    close: "How you win matters."
  },

  links: ["system-combat-01", "system-strength-01", "system-honor-01"]
},

{
  id: "system-combat-01",
  category: "system",
  title: "Combat",

  onmat: {
    line: "Every position is a fight.",
    coach: "No passivity. Compete in every second."
  },

  offmat: {
    reflect: "Did you compete in every position today?",
    close: "Combat means no waiting."
  },

  links: ["standards-effort-01", "system-strength-01"]
},

{
  id: "system-strength-01",
  category: "system",
  title: "Strength",

  onmat: {
    line: "Be strong in body and mind.",
    coach: "Strong position. Strong response. Strong finish."
  },

  offmat: {
    reflect: "Were you strong when practice got hard today?",
    close: "Strength shows under pressure."
  },

  links: ["work-finish-01", "system-combat-01"]
},

{
  id: "system-honor-01",
  category: "system",
  title: "Honor",

  onmat: {
    line: "Do it right.",
    coach: "Skill without honor means nothing."
  },

  offmat: {
    reflect: "Did you carry yourself with honor today?",
    close: "Honor is how you act when nobody checks."
  },

  links: ["standards-respect-01", "identity-code-01"]
},{
  id: "reflect-review-01",
  category: "reflect",
  title: "Review",

  onmat: {
    line: "Think about your reps.",
    coach: "Don’t just go—learn from it."
  },

  offmat: {
    reflect: "What did you do well today? What needs work?",
    close: "Awareness drives improvement."
  },

  links: ["work-daily-01"]
},

{
  id: "reflect-ownit-01",
  category: "reflect",
  title: "Own It",

  onmat: {
    line: "Own your work.",
    coach: "No excuses. Just fix it."
  },

  offmat: {
    reflect: "Did you take ownership of your mistakes today?",
    close: "Ownership leads to growth."
  },

  links: ["identity-code-01"]
},

{
  id: "reflect-adjust-01",
  category: "reflect",
  title: "Adjust",

  onmat: {
    line: "Fix it next rep.",
    coach: "Make adjustments fast."
  },

  offmat: {
    reflect: "Did you make changes or repeat mistakes?",
    close: "Adjustment separates average from elite."
  },

  links: ["system-combat-01"]
},{
  id: "gratitude-room-01",
  category: "gratitude",
  title: "Respect the Room",

  onmat: {
    line: "Value the room.",
    coach: "Not everyone gets this opportunity."
  },

  offmat: {
    reflect: "Did you appreciate the room and the work today?",
    close: "Gratitude builds perspective."
  },

  links: ["standards-respect-01"]
},

{
  id: "gratitude-partner-01",
  category: "gratitude",
  title: "Respect Your Partner",

  onmat: {
    line: "Your partner helps you grow.",
    coach: "You need them to improve."
  },

  offmat: {
    reflect: "Did you help your partner get better today?",
    close: "Better partners build better athletes."
  },

  links: ["system-honor-01"]
},

{
  id: "gratitude-opportunity-01",
  category: "gratitude",
  title: "Opportunity",

  onmat: {
    line: "This is an opportunity.",
    coach: "Not everyone gets to be here."
  },

  offmat: {
    reflect: "Did you treat today like an opportunity or a chore?",
    close: "Opportunity should never feel normal."
  },

  links: ["work-showup-01"]
}

];