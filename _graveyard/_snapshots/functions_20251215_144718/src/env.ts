// functions/src/env.ts

export const IS_EMULATOR =
  process.env.FUNCTIONS_EMULATOR === "true" ||
  process.env.GCLOUD_PROJECT === "demo-sandmandashboard"; // optional convenience

export const PUBLIC_BASE_URL = process.env.PUBLIC_BASE_URL ?? "";

/**
 * Parent Intake entry path.
 *
 * Defaults to the real parent intake page.
 * Can be overridden per environment (emu/prod) via env var.
 *
 * Examples:
 *  - "/intake-parent/"
 *  - "/intake-parent/index.html"
 */
export const PARENT_INTAKE_PATH =
  process.env.PARENT_INTAKE_PATH ?? "/intake-parent/";
