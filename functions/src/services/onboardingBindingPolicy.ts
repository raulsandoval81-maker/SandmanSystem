export type OnboardingBindingInput = Readonly<{
  athleteId: string;
  callerUid: string;
  existingAuthUid: string | null;
  step1Locked: boolean;
  tokenId: string;
  tokenExists: boolean;
  tokenAthleteUid: string;
  tokenUsed: boolean;
  tokenExpiresAt: number;
  now: number;
}>;

export type OnboardingBindingDecision = Readonly<{
  action: "idempotent" | "bind";
  repaired: boolean;
}>;

export function decideOnboardingBinding(input: OnboardingBindingInput): OnboardingBindingDecision {
  if (input.existingAuthUid && input.existingAuthUid !== input.callerUid) throw new Error("DIFFERENT_AUTH_UID");
  if (input.step1Locked && input.existingAuthUid === input.callerUid) {
    return Object.freeze({ action: "idempotent", repaired: false });
  }
  if (!input.tokenId) throw new Error("MISSING_TOKEN");
  if (!input.tokenExists) throw new Error("TOKEN_NOT_FOUND");
  if (input.tokenAthleteUid.trim().toUpperCase() !== input.athleteId) throw new Error("TOKEN_ATHLETE_MISMATCH");
  if (input.tokenUsed) throw new Error("TOKEN_USED");
  if (!input.tokenExpiresAt || input.now > input.tokenExpiresAt) throw new Error("TOKEN_EXPIRED");
  return Object.freeze({ action: "bind", repaired: input.step1Locked && !input.existingAuthUid });
}
