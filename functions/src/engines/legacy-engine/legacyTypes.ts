export interface LegacyRecognition {
  enabled: boolean;
  yearsExperience: number;
  placementXp: number;
  suppressStripe1Tier0: boolean;
  suppressStripe1Tier1: boolean;
  importedBy?: string;
  importedAt?: string;
}

export interface LegacyDecision {
  isLegacy: boolean;
  yearsExperience: number;
  placementXp: number;
  suppressStripe1Tier0: boolean;
  suppressStripe1Tier1: boolean;
  reason: string;
}