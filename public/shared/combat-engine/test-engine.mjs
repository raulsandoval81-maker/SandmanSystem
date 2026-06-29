import { createMatch, applyEvent, EVENT_TYPES, WRESTLERS } from "./index.js";

let match = createMatch({
  style: "folkstyle",
  greenName: "Green",
  redName: "Red",
});

match = applyEvent(match, {
  type: EVENT_TYPES.TAKEDOWN,
  wrestler: WRESTLERS.GREEN,
});

match = applyEvent(match, {
  type: EVENT_TYPES.NEARFALL,
  wrestler: WRESTLERS.GREEN,
  count: 3,
});

console.log(JSON.stringify(match, null, 2));