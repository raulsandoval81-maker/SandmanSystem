"use strict";
// functions/src/env.ts
var _a, _b;
Object.defineProperty(exports, "__esModule", { value: true });
exports.PARENT_INTAKE_PATH = exports.PUBLIC_BASE_URL = exports.IS_EMULATOR = void 0;
exports.IS_EMULATOR = process.env.FUNCTIONS_EMULATOR === "true" ||
    process.env.GCLOUD_PROJECT === "demo-sandmandashboard"; // optional convenience
exports.PUBLIC_BASE_URL = (_a = process.env.PUBLIC_BASE_URL) !== null && _a !== void 0 ? _a : "";
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
exports.PARENT_INTAKE_PATH = (_b = process.env.PARENT_INTAKE_PATH) !== null && _b !== void 0 ? _b : "/intake-parent/";
