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
  if (!Number.isFinite(preset.restDuration) || preset.restDuration <= 0 ||
      !preset.recovery?.label || !preset.recovery.spokenCommand || !preset.recovery.coachingCue) {
    throw new TypeError("A complete active-recovery configuration is required");
  }
  if (!Number.isFinite(transition?.duration) || transition.duration <= 0 ||
      !transition.label || !transition.spokenCommand || !transition.coachingCue) {
    throw new TypeError("An authored transition command is required");
  }
  const sessionCycles = Number(preset.sessionCycles || 1);
  if (!Number.isInteger(sessionCycles) || sessionCycles <= 0) {
    throw new TypeError("A positive whole-number sessionCycles value is required");
  }
  const authoredRoundCount = preset.rounds.length;
  const sessionRounds = Array.from({ length: sessionCycles }, (_, cycleIndex) =>
    preset.rounds.map((round, sourceRoundIndex) => ({ round, cycleIndex, sourceRoundIndex }))
  ).flat();
  const rounds = sessionRounds.map(({ round, cycleIndex, sourceRoundIndex }, roundIndex) => {
    if (!round.actions?.length) throw new TypeError(`Round ${roundIndex + 1} has no actions`);
    const mode = round.mode || "neutral";
    if (!["neutral", "bottom", "footwork"].includes(mode)) {
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
    let activeStance = null;
    const actions = round.actions.map((raw, actionIndex) => {
      const [actionId, label, category, coachingCue, command] = raw;
      if (![actionId, label, category, coachingCue].every(Boolean)) {
        throw new TypeError(`Round ${roundIndex + 1}, action ${actionIndex + 1} is incomplete`);
      }
      if (mode === "footwork") {
        if (!command?.movements?.length || !command.spokenCommands?.length) {
          throw new TypeError(`Round ${roundIndex + 1}, action ${actionIndex + 1} needs footwork commands`);
        }
        if (command.stanceChange) activeStance = command.stanceChange;
        if (!activeStance) {
          throw new TypeError(`Round ${roundIndex + 1} must establish stance before movement`);
        }
        if (!command.selfDirected && (command.movements.length < 1 || command.movements.length > 3)) {
          throw new RangeError(`Round ${roundIndex + 1} footwork cues must contain 1 to 3 steps`);
        }
        const allowed = round.movementMatrix?.stances?.[activeStance] || [];
        if (!command.selfDirected && command.movements.some(movement => !allowed.includes(movement))) {
          throw new RangeError(`Round ${roundIndex + 1} contains movement outside ${activeStance} stance`);
        }
      }
      return Object.freeze({
        actionId, label, category, coachingCue,
        command: command ? Object.freeze({ ...command, activeStance }) : null,
        spokenCommands: Object.freeze(command?.spokenCommands || [label]),
        duration: actionDuration,
        leadInDuration: commandPattern?.leadInDuration || 0,
        transitionDuration: mode === "neutral" &&
          (actionIndex < round.actions.length - 1 || round.trailingTransition !== false)
          ? transition.duration : 0,
        nextAction: round.actions[actionIndex + 1]?.[1] || preset.recovery.label
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
      sessionRoundNumber: roundIndex + 1,
      sourceRoundNumber: sourceRoundIndex + 1,
      cycleNumber: cycleIndex + 1,
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
    sessionCycles,
    authoredRoundCount,
    recovery: Object.freeze({ ...preset.recovery }),
    roundDuration: preset.roundDuration,
    transition: Object.freeze({ ...transition }),
    transitionCommand: Object.freeze({
      label: transition.label,
      coachingCue: transition.coachingCue
    }),
    rounds
  });
}
