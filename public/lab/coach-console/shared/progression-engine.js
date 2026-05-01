export function handleRefProgression(state, side, type) {
  if (!state.refProgress) {
    state.refProgress = {
      athlete: { cautions: 0, stalls: 0, penalties: 0 },
      opponent: { cautions: 0, stalls: 0, penalties: 0 }
    };
  }

  const offender = state.refProgress[side];
  const scoringSide = side === "athlete" ? "opponent" : "athlete";

  function award(points, label) {
    if (scoringSide === "athlete") state.athleteScore += points;
    if (scoringSide === "opponent") state.opponentScore += points;

    return {
      points,
      scoringSide,
      message: `${label}: ${scoringSide === "athlete" ? "Green" : "Red"} +${points}`
    };
  }

  if (type === "caution") {
    offender.cautions += 1;

    if (offender.cautions <= 2) {
      return {
        points: 0,
        scoringSide: null,
        message: `${side === "athlete" ? "Green" : "Red"} caution ${offender.cautions}`
      };
    }

    return award(1, `${side === "athlete" ? "Green" : "Red"} caution ${offender.cautions}`);
  }

  if (type === "stall") {
    offender.stalls += 1;

    if (offender.stalls === 1) {
      return {
        points: 0,
        scoringSide: null,
        message: `${side === "athlete" ? "Green" : "Red"} stall warning`
      };
    }

    if (offender.stalls === 2 || offender.stalls === 3) {
      return award(1, `${side === "athlete" ? "Green" : "Red"} stall ${offender.stalls}`);
    }

    if (offender.stalls === 4) {
      return award(2, `${side === "athlete" ? "Green" : "Red"} stall ${offender.stalls}`);
    }

    return {
      dq: true,
      winner: scoringSide,
      resultType: "dq",
      message: `${side === "athlete" ? "Green" : "Red"} disqualified for stalling`
    };
  }

  if (type === "penalty") {
    offender.penalties += 1;

    if (offender.penalties === 1 || offender.penalties === 2) {
      return award(1, `${side === "athlete" ? "Green" : "Red"} penalty ${offender.penalties}`);
    }

    if (offender.penalties === 3) {
      return award(2, `${side === "athlete" ? "Green" : "Red"} penalty ${offender.penalties}`);
    }

    return {
      dq: true,
      winner: scoringSide,
      resultType: "dq",
      message: `${side === "athlete" ? "Green" : "Red"} disqualified by penalty progression`
    };
  }

  return {
    points: 0,
    scoringSide: null,
    message: "Unknown ref call"
  };
}