export function buildShadowTrainingPlan(preset) {
  if (!preset?.rounds?.length) throw new TypeError("An authored Shadow preset is required");
  if (!Number.isFinite(preset.roundDuration) || preset.roundDuration <= 0) {
    throw new TypeError("A positive authored roundDuration is required");
  }
  const transition = preset.transition || (preset.transitionCommand && {
    duration: preset.transitionDuration,
    label: preset.transitionCommand.label,
    spokenCommand: preset.transitionCommand.label,
    coachingCue: preset.transitionCommand.coachingCue
  });
  if (!Number.isFinite(preset.actionDuration) || preset.actionDuration <= 0) {
    throw new TypeError("A positive resolved actionDuration is required");
  }
  if (!Number.isFinite(transition?.duration) || transition.duration <= 0 ||
      !transition.label || !transition.spokenCommand || !transition.coachingCue) {
    throw new TypeError("An authored transition command is required");
  }
  const rounds = preset.rounds.map((round, roundIndex) => {
    if (!round.actions?.length) throw new TypeError(`Round ${roundIndex + 1} has no actions`);
    const mode = round.mode || "neutral";
    if (!["neutral", "bottom"].includes(mode)) {
      throw new TypeError(`Round ${roundIndex + 1} has an unsupported mode`);
    }
    const commandPattern = mode === "bottom" ? round.commandPattern : null;
    if (mode === "bottom" &&
        (!Number.isFinite(commandPattern?.leadInDuration) || commandPattern.leadInDuration <= 0 ||
         !commandPattern.countdown?.length || !commandPattern.executionCommand)) {
      throw new TypeError(`Round ${roundIndex + 1} requires a complete bottom command pattern`);
    }
    const actionDuration = round.actionDuration || preset.actionDuration;
    const expectedDuration = round.roundDuration || preset.roundDuration;
    const actions = round.actions.map((raw, actionIndex) => {
      const [actionId, label, category, coachingCue] = raw;
      if (![actionId, label, category, coachingCue].every(Boolean)) {
        throw new TypeError(`Round ${roundIndex + 1}, action ${actionIndex + 1} is incomplete`);
      }
      return Object.freeze({
        actionId, label, category, coachingCue,
        duration: actionDuration,
        leadInDuration: commandPattern?.leadInDuration || 0,
        transitionDuration: mode === "neutral" &&
          (actionIndex < round.actions.length - 1 || round.trailingTransition !== false)
          ? transition.duration : 0,
        nextAction: round.actions[actionIndex + 1]?.[1] ||
          (roundIndex < preset.rounds.length - 1 ? "Recovery" : "Complete")
      });
    });
    const resolvedDuration = actions.reduce(
      (total, action) => total + action.duration + action.leadInDuration + action.transitionDuration,
      0
    );
    if (resolvedDuration !== expectedDuration) {
      throw new RangeError(
        `Round ${roundIndex + 1} resolves to ${resolvedDuration}s; expected ${expectedDuration}s`
      );
    }
    return Object.freeze({
      ...round,
      number: roundIndex + 1,
      mode,
      roundDuration: expectedDuration,
      commandPattern: commandPattern ? Object.freeze({ ...commandPattern }) : null,
      actions
    });
  });
  return Object.freeze({
    id: preset.id, label: preset.label,
    discipline: preset.discipline || "wrestling",
    journey: preset.journey || "road2champion",
    tier: preset.tier || "t0",
    rankName: preset.rankName || "Shadow",
    prerollDuration: preset.prerollDuration,
    restDuration: preset.restDuration,
    shortTimeAt: preset.shortTimeAt,
    roundDuration: preset.roundDuration,
    transition: Object.freeze({ ...transition }),
    transitionCommand: Object.freeze({
      label: transition.label,
      coachingCue: transition.coachingCue
    }),
    rounds
  });
}
