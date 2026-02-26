"use strict";
// functions/src/env.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.PARENT_INTAKE_PATH = exports.PUBLIC_BASE_URL = exports.IS_EMULATOR = void 0;
exports.IS_EMULATOR = process.env.FUNCTIONS_EMULATOR === "true" ||
    process.env.GCLOUD_PROJECT === "demo-sandmandashboard"; // optional convenience
exports.PUBLIC_BASE_URL = process.env.PUBLIC_BASE_URL ?? "";
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
exports.PARENT_INTAKE_PATH = process.env.PARENT_INTAKE_PATH ?? "/intake-parent/";
