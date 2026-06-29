// Wrestling Combat Engine

export * from "./types.js";

export { folkstyleRules } from "./folkstyle.js";
export { freestyleRules } from "./freestyle.js";
export { grecoRules } from "./greco.js";
export { beachRules } from "./beach.js";

export {
  wrestlingRuleSets,
  getRules,
  createMatch,
  applyEvent,
} from "./scoring-engine.js";