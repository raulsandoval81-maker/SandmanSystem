import { runTraitStep } from "./onboarding-trait-step.js";

const step = Number((window.location.pathname.match(/step-(\d+)\.html$/) || [])[1]);
const config = {
  2: { trait: "honor", inputId: "honor-score", valueId: "honor-val" },
  3: { trait: "strong", inputId: "strong-score", valueId: "strong-val" },
  4: { trait: "fast", inputId: "fast-score", valueId: "fast-val" },
  5: { trait: "smart", inputId: "smart-score", valueId: "smart-val" },
  6: { trait: "courage", inputId: "courage-score", valueId: "courage-val" },
}[step];

if (!config) throw new Error(`Unsupported onboarding trait step: ${step || "unknown"}`);
runTraitStep({ ...config, step, nextStep: step + 1 });
