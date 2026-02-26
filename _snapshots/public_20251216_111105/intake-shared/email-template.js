// ===============================================
// Sandman Combat System — Onboarding Email v1
// Last Updated: Coach Sandoval — 2025-12-04
// ===============================================

export function buildOnboardingEmail(onboardingUrl, athleteName = "your athlete") {
  
  const subject = `Welcome to the Sandman Combat System — Begin Your Path`;

  const body = `
Hello,

Your athlete, ${athleteName}, has been officially approved into the Sandman Combat System.

Next Step:
Please click the link below to begin the athlete onboarding journey:

Begin Your Path → ${onboardingUrl}

This onboarding includes:
• Identity check
• Athlete reflections
• Commitment statement
• First steps into the Arsenal

If this athlete did not request onboarding, please reply to this email.

Welcome to the journey.

Sandman Combat System™
Built in the shadows. Staged in the light.
`;

  return { subject, body };
}
