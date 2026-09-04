import { F8_STRIPES_PER_RANK } from "../../policy/f8ProgressionPolicy";

export const PASSING_SCORE = 85;

export function requiredStripes(programCode: string): number {

  if (programCode === "F8") {

    return F8_STRIPES_PER_RANK;

  }

  return 4;

}
