/**
 * Sandman Combat Engine
 * Validator V1
 *
 * Ensures only legal wrestling events are accepted.
 */

import {
  EVENT_TYPES,
  POSITIONS,
  MATCH_STATUS,
} from "../types.js";

export function validateEvent(match, event) {
  const errors = [];

  if (!match) {
    errors.push("Missing match.");
  }

  if (!event) {
    errors.push("Missing event.");
  }

  if (errors.length) {
    return invalid(errors);
  }

  if (match.status === MATCH_STATUS.ENDED) {
    return invalid("Match has already ended.");
  }

  switch (event.type) {

    case EVENT_TYPES.TAKEDOWN:
      if (match.position !== POSITIONS.NEUTRAL) {
        return invalid("Takedown only allowed from neutral.");
      }
      break;

    case EVENT_TYPES.ESCAPE:
      if (
        match.position !== POSITIONS.GREEN_TOP &&
        match.position !== POSITIONS.RED_TOP
      ) {
        return invalid("Escape requires bottom position.");
      }
      break;

    case EVENT_TYPES.REVERSAL:
      if (
        match.position !== POSITIONS.GREEN_TOP &&
        match.position !== POSITIONS.RED_TOP
      ) {
        return invalid("Reversal requires bottom position.");
      }
      break;

    case EVENT_TYPES.NEARFALL:
      if (
        match.position !== POSITIONS.GREEN_TOP &&
        match.position !== POSITIONS.RED_TOP
      ) {
        return invalid("Nearfall requires top control.");
      }
      break;

    case EVENT_TYPES.PIN:
    case EVENT_TYPES.FALL:
      if (
        match.position !== POSITIONS.GREEN_TOP &&
        match.position !== POSITIONS.RED_TOP
      ) {
        return invalid("Pin requires top control.");
      }
      break;

    default:
      break;
  }

  return {
    valid: true,
    errors: [],
  };
}

function invalid(message) {
  return {
    valid: false,
    errors: Array.isArray(message) ? message : [message],
  };
}