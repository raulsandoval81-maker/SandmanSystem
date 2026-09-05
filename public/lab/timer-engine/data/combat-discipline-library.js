const action = (actionId, label, category, coachingCue) =>
  Object.freeze([actionId, label, category, coachingCue]);

const round = (id, purpose, actions) => Object.freeze({
  id,
  purpose,
  actions: Object.freeze(actions)
});

const WRESTLING_ROUNDS = Object.freeze([
  round("foundation", "Foundation", [
    action("stance-motion", "Move Your Feet", "foundation", "Stay balanced, stay in stance, and keep your feet moving."),
    action("circle-left", "Circle Left", "movement", "Stay low and keep your stance while circling."),
    action("circle-right", "Circle Right", "movement", "Change direction without crossing your feet.")
  ]),
  round("level", "Level", [
    action("level-change", "Level Change", "position", "Lower your level with posture and balance."),
    action("recover-stance", "Recover Stance", "recovery", "Return to a strong stance under control."),
    action("level-change-repeat", "Level Change", "position", "Repeat the same clean level change.")
  ]),
  round("attack", "Attack", [
    action("set-up", "Set Up", "attack", "Move first and create a clean opening."),
    action("penetration-step", "Penetration Step", "attack", "Step through with posture and control."),
    action("recover-stance", "Recover Stance", "recovery", "Finish balanced and return to stance.")
  ]),
  round("defense", "Defense", [
    action("sprawl-motion", "Sprawl Motion", "defense", "Hips back, chest pressure, and stay controlled."),
    action("down-block", "Down Block", "defense", "Hands down, hips back, and recover your stance."),
    action("shot-response", "Shot", "response", "Score back with posture and control.")
  ]),
  Object.freeze({ ...round("recovery", "Bottom Recovery", [
    action("stand-up", "Stand Up", "recovery", "Protect your hands and rise with control."),
    action("switch", "Switch", "recovery", "Turn your hips, clear position, and build your base."),
    action("granby", "Granby", "recovery", "Stay compact and move through the roll under control."),
    action("stand-up-repeat", "Stand Up", "recovery", "Return to the foundation and finish with control.")
  ]), mode: "bottom", commandPattern: Object.freeze({
    leadInDuration: 3, countdown: Object.freeze([3, 2, 1]), executionCommand: "Hit it"
  }) })
]);

const SUBMISSION_GRAPPLING_ROUNDS = Object.freeze([
  ...WRESTLING_ROUNDS.slice(0, 4),
  Object.freeze({ ...round("grappling-recovery", "Grappling Recovery", [
    action("hip-escape", "Hip Escape", "recovery", "Frame, move your hips, and rebuild safe position."),
    action("bridge", "Bridge", "recovery", "Drive through your feet and keep the motion controlled."),
    action("technical-stand-up", "Technical Stand Up", "recovery", "Protect your space and return to your feet safely."),
    action("hip-escape-repeat", "Hip Escape", "recovery", "Return to the foundation and finish with clean movement.")
  ]), mode: "bottom", commandPattern: Object.freeze({
    leadInDuration: 3, countdown: Object.freeze([3, 2, 1]), executionCommand: "Hit it"
  }) })
]);

const BOXING_ROUNDS = Object.freeze([
  round("foundation", "Foundation", [
    action("stance-motion", "Move Your Feet", "foundation", "Stay balanced and move from your stance."),
    action("jab", "Jab", "attack", "Return the hand to guard after every jab."),
    action("double-jab", "Double Jab", "attack", "Step with two controlled jabs and recover your guard.")
  ]),
  round("straight-shots", "Straight Shots", [
    action("jab", "Jab", "attack", "Use the lead hand without reaching."),
    action("one-two", "1-2", "attack", "Turn the cross and return to stance."),
    action("angle-out", "Angle Out", "movement", "Exit on an angle with your guard up.")
  ]),
  round("defense", "Defense", [
    action("slip", "Slip", "defense", "Move just outside the center line."),
    action("roll", "Roll", "defense", "Stay balanced as you roll under."),
    action("angle-out", "Angle Out", "movement", "Finish the defense with your feet.")
  ]),
  round("combine", "Combine", [
    action("jab", "Jab", "attack", "Set the range with the lead hand."),
    action("one-two", "1-2", "attack", "Keep the combination straight and controlled."),
    action("angle-out", "Angle Out", "movement", "Move after the combination.")
  ]),
  Object.freeze({ ...round("control", "Control", [
    action("stance-motion", "Move Your Feet", "foundation", "Stay relaxed and hold your stance."),
    action("double-jab", "Double Jab", "attack", "Build rhythm without rushing."),
    action("slip", "Slip", "defense", "Finish responsible and ready.")
  ]), trailingTransition: false })
]);

const MUAY_THAI_ROUNDS = Object.freeze([
  round("foundation", "Foundation", [
    action("stance-motion", "Move Your Feet", "foundation", "Stay tall, balanced, and ready to check."),
    action("jab", "Jab", "attack", "Touch the target and return to guard."),
    action("teep", "Teep", "attack", "Lift, extend, and return to stance under control.")
  ]),
  round("defense", "Defense", [
    action("check", "Check", "defense", "Lift the leg without losing posture."),
    action("move", "Move Your Feet", "movement", "Reset your base after the check."),
    action("exit", "Exit", "movement", "Leave safely with your guard in place.")
  ]),
  round("striking", "Striking", [
    action("jab", "Jab", "attack", "Use the jab to establish range."),
    action("kick", "Kick", "attack", "Turn the hip and recover your stance."),
    action("exit", "Exit", "movement", "Move after the strike.")
  ]),
  round("close-range", "Close Range", [
    action("knee", "Knee", "attack", "Stay tall and return the foot under you."),
    action("teep", "Teep", "attack", "Create space with balance."),
    action("check", "Check", "defense", "Finish ready to defend.")
  ]),
  Object.freeze({ ...round("control", "Control", [
    action("stance-motion", "Move Your Feet", "foundation", "Control your pace and posture."),
    action("jab", "Jab", "attack", "Stay clean and accurate."),
    action("exit", "Exit", "movement", "Finish every exchange safely.")
  ]), trailingTransition: false })
]);

const MMA_ROUNDS = Object.freeze([
  round("foundation", "Foundation", [
    action("stance-motion", "Move Your Feet", "foundation", "Stay ready to strike or change levels."),
    action("jab", "Jab", "attack", "Use the jab without giving up your stance."),
    action("level-change", "Level Change", "position", "Lower your level with balance.")
  ]),
  round("entry", "Entry", [
    action("jab", "Jab", "attack", "Establish range before changing levels."),
    action("shoot", "Shoot", "attack", "Enter with posture and control."),
    action("exit", "Exit", "movement", "Recover your stance after the entry.")
  ]),
  round("defense", "Defense", [
    action("sprawl", "Sprawl", "defense", "Send the hips back and stay controlled."),
    action("pummel", "Pummel", "position", "Recover inside position with good posture."),
    action("exit", "Exit", "movement", "Clear safely and reset.")
  ]),
  round("connection", "Connection", [
    action("jab", "Jab", "attack", "Start with a clean straight attack."),
    action("level-change", "Level Change", "position", "Show the level without reaching."),
    action("sprawl", "Sprawl", "defense", "Return quickly to a stable stance.")
  ]),
  Object.freeze({ ...round("control", "Control", [
    action("stance-motion", "Move Your Feet", "foundation", "Control distance and stay ready."),
    action("pummel", "Pummel", "position", "Work for balanced inside position."),
    action("exit", "Exit", "movement", "Finish in a responsible stance.")
  ]), trailingTransition: false })
]);

const transition = (label, spokenCommand, coachingCue) =>
  Object.freeze({ duration: 3, label, spokenCommand, coachingCue });

export const COMBAT_DISCIPLINE_LIBRARY = Object.freeze({
  wrestling: Object.freeze({
    label: "Wrestling",
    transition: transition("Hand Fight", "Hand fight", "Stay active with your hands and keep position."),
    rounds: WRESTLING_ROUNDS
  }),
  boxing: Object.freeze({
    label: "Boxing",
    transition: transition("Move", "Move", "Stay responsible with your feet and guard."),
    rounds: BOXING_ROUNDS
  }),
  "muay-thai": Object.freeze({
    label: "Muay Thai",
    transition: transition("Reset", "Reset", "Recover your stance and guard before the next action."),
    rounds: MUAY_THAI_ROUNDS
  }),
  mma: Object.freeze({
    label: "MMA",
    transition: transition("Reset Position", "Reset position", "Return to a stance that supports striking and grappling."),
    rounds: MMA_ROUNDS
  }),
  "submission-grappling": Object.freeze({
    label: "Submission Grappling",
    derivedFrom: "wrestling",
    transition: transition("Hand Fight", "Hand fight", "Recover inside position and stay balanced."),
    rounds: SUBMISSION_GRAPPLING_ROUNDS
  })
});
