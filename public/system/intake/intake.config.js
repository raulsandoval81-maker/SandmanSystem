// system/intake/intake.config.js
// Sandman Intake Loop — Canonical Collections (v1.1)

export const INTAKE_CONFIG = {
  token: {
    lifespanHours: 48,
    canonicalCase: "lowercase", // ✅ enforced by intake.tokens.js normalizeToken()
    legacyCollection: "intakeTokens", // ⚠ legacy only — do not write here
    prefix: "TK-",
  },

  intakes: {
    collection: "intakes",
    statuses: {
      invited: "invited",
      submitted: "submitted",
      approved: "approved",
    },
  },

  athletes: {
    collection: "athletes",
  },

  counters: {
    collection: "counters",
    docs: { f8: "f8", f4: "f4" },
  },

  receipts: {
    collection: "receipts",
  },
};
