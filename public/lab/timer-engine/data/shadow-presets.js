import { resolveCombatTrainingPreset } from "/lab/timer-engine/engine/combat-training-preset-resolver.js";

// Compatibility export for the field-tested default. Generic callers use the resolver directly.
export const SHADOW_WRESTLING_PRESET = resolveCombatTrainingPreset({
  discipline: "wrestling",
  journey: "road2champion",
  tier: "t0"
});
