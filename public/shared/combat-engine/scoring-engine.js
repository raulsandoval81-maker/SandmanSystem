import {
  EVENT_TYPES,
  MATCH_STATUS,
  POSITIONS,
  WIN_METHODS,
  opponentOf,
  topPositionFor,
} from "./types.js";

import { cloneMatch, endMatch } from "./match.js";

import { folkstyleRules } from "./folkstyle.js";
import { freestyleRules } from "./freestyle.js";
import { grecoRules } from "./greco.js";
import { beachRules } from "./beach.js";

export const wrestlingRuleSets = Object.freeze({
  folkstyle: folkstyleRules,
  freestyle: freestyleRules,
  greco: grecoRules,
  beach: beachRules,
});

export function getRules(style = "folkstyle") {
  const rules = wrestlingRuleSets[style];

  if (!rules) {
    throw new Error(`Unknown wrestling ruleset: ${style}`);
  }

  return rules;
}

export function applyEvent(matchState, event) {
  if (!matchState) throw new Error("Missing matchState.");
  if (!event) throw new Error("Missing event.");
  if (matchState.status === MATCH_STATUS.ENDED) return matchState;

  const rules = getRules(matchState.style);
  const next = cloneMatch(matchState);

  const wrestler = event.wrestler;
  const opponent = wrestler ? opponentOf(wrestler) : null;

  const points = resolvePoints(rules, event);

  if (wrestler && points > 0) {
    next[wrestler].score += points;
  }

  updatePosition(next, event, wrestler, opponent);
  recordEvent(next, event, points);
  checkMatchEnd(next, rules, event, wrestler);

  return next;
}

function resolvePoints(rules, event) {
  const type = event.type;

  if (type === EVENT_TYPES.NEARFALL) {
    const count = Number(event.count || event.points || 2);
    return rules.scoring.nearfall?.[count] || 0;
  }

  if (type === EVENT_TYPES.THROW && event.bigThrow) {
    return rules.scoring.bigThrow || rules.scoring[EVENT_TYPES.THROW] || 0;
  }

  if (type === EVENT_TYPES.PENALTY) {
    return Number(event.points || rules.scoring.penaltyDefault || 1);
  }

  return Number(event.points || rules.scoring[type] || 0);
}

function updatePosition(match, event, wrestler, opponent) {
  if (!wrestler) return;

  switch (event.type) {
    case EVENT_TYPES.TAKEDOWN:
      match.position = topPositionFor(wrestler);
      break;

    case EVENT_TYPES.ESCAPE:
      match.position = POSITIONS.NEUTRAL;
      break;

    case EVENT_TYPES.REVERSAL:
      match.position = topPositionFor(wrestler);
      break;

    case EVENT_TYPES.PIN:
    case EVENT_TYPES.FALL:
    case EVENT_TYPES.END_MATCH:
      match.position = POSITIONS.ENDED;
      break;

    default:
      break;
  }
}

function checkMatchEnd(match, rules, event, wrestler) {
  if (event.type === EVENT_TYPES.PIN || event.type === EVENT_TYPES.FALL) {
    Object.assign(
      match,
      endMatch(match, wrestler, rules.winMethods.fall || WIN_METHODS.FALL)
    );
    return;
  }

  if (event.type === EVENT_TYPES.END_MATCH) {
    const winner = getPointsWinner(match);
    Object.assign(match, endMatch(match, winner, WIN_METHODS.POINTS));
    return;
  }

  if (rules.techFallLead) {
    const lead = Math.abs(match.green.score - match.red.score);

    if (lead >= rules.techFallLead) {
      const winner = match.green.score > match.red.score ? "green" : "red";
      Object.assign(match, endMatch(match, winner, rules.winMethods.tech));
      return;
    }
  }

  if (rules.pointsToWin) {
    if (match.green.score >= rules.pointsToWin) {
      Object.assign(match, endMatch(match, "green", WIN_METHODS.POINTS));
      return;
    }

    if (match.red.score >= rules.pointsToWin) {
      Object.assign(match, endMatch(match, "red", WIN_METHODS.POINTS));
    }
  }
}

function getPointsWinner(match) {
  if (match.green.score > match.red.score) return "green";
  if (match.red.score > match.green.score) return "red";
  return null;
}

function recordEvent(match, event, points) {
  match.events.push({
    ...event,
    points,
    scoreAfter: {
      green: match.green.score,
      red: match.red.score,
    },
    positionAfter: match.position,
    statusAfter: match.status,
  });
}