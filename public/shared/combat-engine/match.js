import {
  MATCH_STATUS,
  POSITIONS,
  createInitialMatchState,
} from "./types.js";

export function createMatch(options = {}) {
  return createInitialMatchState({
    style: options.style || "folkstyle",
    greenName: options.greenName || "Green",
    redName: options.redName || "Red",
  });
}

export function startMatch(match) {
  return {
    ...match,
    status: MATCH_STATUS.LIVE,
  };
}

export function endMatch(match, winner = null, winMethod = null) {
  return {
    ...match,
    status: MATCH_STATUS.ENDED,
    position: POSITIONS.ENDED,
    winner,
    winMethod,
  };
}

export function resetMatch(match) {
  return createInitialMatchState({
    style: match.style,
    greenName: match.green.name,
    redName: match.red.name,
  });
}

export function cloneMatch(match) {
  return structuredClone
    ? structuredClone(match)
    : JSON.parse(JSON.stringify(match));
}