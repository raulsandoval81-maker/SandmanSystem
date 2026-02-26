// system/intake/intake.config.js
// Global configuration for the Sandman Intake Loop

export const INTAKE_CONFIG = {
  token: {
    lifespanHours: 48,
    collection: "intakeTokens",
    prefix: "TK-",
  },

  parentIntake: {
    collection: "intakeSubmissions",
  },

  approvedIntake: {
    collection: "approvedIntakes",
  }
};
