export function handleRefProgression(state, side, type) {
  if (!state.refProgress) {
    state.refProgress = {
      athlete: { cautions: 0, stalls: 0, lockedHands: 0 },
      opponent: { cautions: 0, stalls: 0, lockedHands: 0 }
    };
  }
const offender = state.refProgress[side];

if (typeof offender.lockedHands !== "number") {
  offender.lockedHands = 0;
}
  const scoringSide = side === "athlete" ? "opponent" : "athlete";
  const offenderLabel = side === "athlete" ? "Green" : "Red";
  const scoringLabel = scoringSide === "athlete" ? "Green" : "Red";

  function award(points, label) {
    if (scoringSide === "athlete") state.athleteScore += points;
    if (scoringSide === "opponent") state.opponentScore += points;

    return {
      points,
      scoringSide,
      message: `${label}: ${scoringLabel} +${points}`
    };
  }

  if (type === "caution") {
    offender.cautions += 1;

    if (offender.cautions === 1) {
      return {
        points: 0,
        scoringSide: null,
        message: `${offenderLabel} CAU W`
      };
    }

    if (offender.cautions === 2 || offender.cautions === 3) {
      return award(1, `${offenderLabel} CAU ${offender.cautions}`);
    }

    if (offender.cautions === 4) {
      return award(2, `${offenderLabel} CAU ${offender.cautions}`);
    }

    return {
      dq: true,
      winner: scoringSide,
      resultType: "dq",
      message: `${offenderLabel} DQ by cautions`
    };
  }

  if (type === "stall") {
    offender.stalls += 1;

    if (offender.stalls === 1) {
      return {
        points: 0,
        scoringSide: null,
        message: `${offenderLabel} STL W`
      };
    }

    if (offender.stalls === 2 || offender.stalls === 3) {
      return award(1, `${offenderLabel} STL ${offender.stalls}`);
    }

    if (offender.stalls === 4) {
      return award(2, `${offenderLabel} STL ${offender.stalls}`);
    }

    return {
      dq: true,
      winner: scoringSide,
      resultType: "dq",
      message: `${offenderLabel} DQ by stalling`
    };
  }

  if (type === "lockedHands") {
    offender.lockedHands += 1;

    if (offender.lockedHands === 1 || offender.lockedHands === 2) {
      return award(1, `${offenderLabel} LH ${offender.lockedHands}`);
    }

    if (offender.lockedHands === 3) {
      return award(2, `${offenderLabel} LH ${offender.lockedHands}`);
    }

    return {
      dq: true,
      winner: scoringSide,
      resultType: "dq",
      message: `${offenderLabel} DQ by locked hands`
    };
  }

  return {
    points: 0,
    scoringSide: null,
    message: "Unknown ref call"
  };
}