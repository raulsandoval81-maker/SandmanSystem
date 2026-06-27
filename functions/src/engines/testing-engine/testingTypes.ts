export interface TestingDecision {

  engine: string;

  eligible: boolean;

  athleteId: string;

  athleteName: string;

  currentTier: number;

  currentStripe: number;

  passingScore: number;

  status: string;

  nextAction: string;

  coachAction: string;

  message: string;

}