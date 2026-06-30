export * from "./types.js";
export * from "./core/match.js";
export * from "./core/match-clock.js";

export { folkstyleRules } from "./rules/folkstyle.js";
export { freestyleRules } from "./rules/freestyle.js";
export { grecoRules } from "./rules/greco.js";
export { beachRules } from "./rules/beach.js";

export {
  wrestlingRuleSets,
  getRules,
  applyEvent,
} from "./core/scoring-engine.js";