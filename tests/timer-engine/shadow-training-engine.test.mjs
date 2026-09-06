import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

async function importBrowserModule(path) {
  const source = readFileSync(path, "utf8");
  const url = `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
  return import(url);
}

const policySource = readFileSync("public/lab/timer-engine/data/combat-training-policy.js", "utf8");
const policyUrl = `data:text/javascript;base64,${Buffer.from(policySource).toString("base64")}`;
const librarySource = readFileSync("public/lab/timer-engine/data/combat-discipline-library.js", "utf8");
const libraryUrl = `data:text/javascript;base64,${Buffer.from(librarySource).toString("base64")}`;
const { FOUNDATIONAL_FOOTWORK, FOUNDATIONAL_FOOTWORK_ROUND } = await import(libraryUrl);
const resolverSource = readFileSync(
  "public/lab/timer-engine/engine/combat-training-preset-resolver.js",
  "utf8"
).replace("/lab/timer-engine/data/combat-training-policy.js", policyUrl)
  .replace("/lab/timer-engine/data/combat-discipline-library.js", libraryUrl);
const resolverUrl = `data:text/javascript;base64,${Buffer.from(resolverSource).toString("base64")}`;
const { resolveCombatTrainingPreset } = await import(resolverUrl);
const { buildShadowTrainingPlan } = await importBrowserModule(
  "public/lab/timer-engine/engine/shadow-sequence-builder.js"
);
const { ShadowTrainingEngine } = await importBrowserModule(
  "public/lab/timer-engine/engine/shadow-training-engine.js"
);

const SHADOW_WRESTLING_PRESET = resolveCombatTrainingPreset();
const plan = buildShadowTrainingPlan(SHADOW_WRESTLING_PRESET);

function createEngine(enginePlan = plan) {
  let now = 0;
  const events = [];
  const engine = new ShadowTrainingEngine(enginePlan, {
    now: () => now,
    onChange: view => events.push(view)
  });
  return {
    engine,
    events,
    setNow(value) { now = value; },
    finishPhase() {
      now = engine.deadline;
      engine.tick(engine.token);
      engine.clear();
    }
  };
}

test("Shadow preset resolves exact mode-aware round durations", () => {
  assert.equal(plan.roundDuration, 45);
  assert.equal(plan.rounds.length, 10);
  assert.deepEqual(plan.rounds.map(round => round.roundDuration), Array(10).fill(45));
  for (const round of plan.rounds) {
    const duration = round.actions.reduce(
      (total, action) => total + action.duration + action.leadInDuration + action.transitionDuration,
      0
    );
    assert.equal(duration, 45);
  }
  assert.throws(
    () => buildShadowTrainingPlan({
      ...SHADOW_WRESTLING_PRESET,
      rounds: SHADOW_WRESTLING_PRESET.rounds.map((round, index) =>
        index === 0 ? { ...round, roundDuration: 44 } : round)
    }),
    /resolves to 45s; expected 44s/
  );
});

test("Short Time truth survives pause/resume without a duplicate threshold event", () => {
  const harness = createEngine();
  const { engine, events } = harness;
  engine.roundIndex = 1;
  engine.actionIndex = 2;
  engine.state = "working";
  engine.remaining = 7;
  engine.deadline = 7000;
  engine.shortTimeCalled = false;

  harness.setNow(0);
  engine.tick(engine.token);
  engine.clear();
  assert.equal(events.at(-1).reason, "short-time");
  assert.equal(events.at(-1).isShortTime, true);

  engine.pause();
  assert.equal(events.at(-1).state, "paused");
  assert.equal(events.at(-1).isShortTime, false);
  engine.resume();
  engine.clear();
  assert.equal(events.at(-1).reason, "resumed");
  assert.equal(events.at(-1).isShortTime, true);
  assert.equal(events.filter(event => event.reason === "short-time").length, 1);
});

test("Short Time clears outside live work and for a new round", () => {
  const { engine, events } = createEngine();
  engine.roundIndex = 1;
  engine.actionIndex = 2;
  engine.state = "transitioning";
  engine.remaining = 3;
  engine.shortTimeCalled = true;
  engine.emit("test-short-transition");
  assert.equal(events.at(-1).isShortTime, true);

  engine.state = "resting";
  engine.remaining = 30;
  engine.emit("test-rest");
  assert.equal(events.at(-1).isShortTime, false);

  engine.state = "completed";
  engine.emit("test-complete");
  assert.equal(events.at(-1).isShortTime, false);

  engine.state = "working";
  engine.roundIndex = 1;
  engine.actionIndex = 0;
  engine.remaining = 12;
  engine.shortTimeCalled = false;
  engine.emit("test-new-round");
  assert.equal(events.at(-1).isShortTime, false);

  engine.stop();
  assert.equal(events.at(-1).isShortTime, false);
});

test("Wrestling discipline rounds 2-4 retain final Hand Fight transitions before Recovery", () => {
  for (let roundIndex = 1; roundIndex < 4; roundIndex += 1) {
    const harness = createEngine();
    const { engine, events } = harness;
    engine.roundIndex = roundIndex;
    engine.actionIndex = 0;
    engine.beginCurrentAction("round-started");
    engine.clear();

    for (let actionIndex = 0; actionIndex < 3; actionIndex += 1) {
      assert.equal(engine.state, "working");
      harness.finishPhase();
      assert.equal(engine.state, "transitioning");
      assert.equal(events.at(-1).transitionCommand.label, "Hand Fight");
      assert.deepEqual(events.at(-1).spokenCommands, ["Hand fight"]);
      harness.finishPhase();
    }

    assert.equal(engine.state, "resting");
    assert.equal(events.filter(event => event.reason === "transition-started").length, 3);
  }
});

test("Round 5 and Round 10 enter recovery after identical Bottom motion", () => {
  for (const roundIndex of [4, 9]) {
    const harness = createEngine();
    const { engine, events } = harness;
    engine.roundIndex = roundIndex;
    engine.actionIndex = 0;
    engine.shortTimeCalled = false;
    engine.beginCurrentAction("round-started");
    engine.clear();

    for (let actionIndex = 0; actionIndex < 4; actionIndex += 1) {
      assert.equal(engine.state, "transitioning");
      assert.equal(engine.transitionKind, "bottom-lead-in");
      harness.finishPhase();
      assert.equal(engine.state, "working");
      assert.equal(events.at(-1).reason, "bottom-action-started");
      harness.finishPhase();
    }

    assert.equal(engine.state, "resting");
    assert.equal(events.filter(event => event.reason === "transition-started").length, 0);
    harness.finishPhase();
    if (roundIndex === 4) {
      assert.equal(engine.roundIndex, 5);
      assert.equal(engine.state, "working");
    } else {
      assert.equal(engine.state, "completed");
    }
  }
  assert.deepEqual(
    plan.rounds[4].actions.map(({ actionId, label, duration, leadInDuration }) =>
      ({ actionId, label, duration, leadInDuration })),
    plan.rounds[9].actions.map(({ actionId, label, duration, leadInDuration }) =>
      ({ actionId, label, duration, leadInDuration }))
  );
  assert.deepEqual(plan.rounds[9].actions.map(action => action.label), ["Stand Up", "Switch", "Granby", "Stand Up"]);
  assert.equal(plan.rounds[9].commandPattern.executionCommand, "Hit it");
  assert.doesNotMatch(JSON.stringify(plan.rounds[9]), /Oklahoma/i);
});

test("Bottom cue rhythm emits 3-2-1 before technique and Hit It", () => {
  const harness = createEngine();
  const { engine, events } = harness;
  engine.roundIndex = 4;
  engine.actionIndex = 0;
  engine.beginCurrentAction("round-started");
  engine.clear();

  assert.equal(events.at(-1).reason, "bottom-cue-started");
  assert.equal(events.at(-1).bottomCountdown, 3);
  assert.deepEqual(events.at(-1).spokenCommands, ["3"]);
  harness.setNow(engine.deadline - 1900);
  engine.tick(engine.token);
  engine.clear();
  assert.equal(events.at(-1).bottomCountdown, 2);
  assert.deepEqual(events.at(-1).spokenCommands, ["2"]);
  harness.setNow(engine.deadline - 900);
  engine.tick(engine.token);
  engine.clear();
  assert.equal(events.at(-1).bottomCountdown, 1);
  assert.deepEqual(events.at(-1).spokenCommands, ["1"]);
  harness.finishPhase();

  assert.equal(events.at(-1).reason, "bottom-action-started");
  assert.equal(events.at(-1).action.label, "Stand Up");
  assert.equal(events.at(-1).round.commandPattern.executionCommand, "Hit it");
  assert.deepEqual(events.at(-1).spokenCommands, ["Stand Up", "Hit it"]);
  assert.equal(events.filter(event => event.reason === "bottom-countdown").length, 2);
});

test("Round 5 Short Time still triggers and remains pause/resume safe", () => {
  const harness = createEngine();
  const { engine, events } = harness;
  engine.roundIndex = 4;
  engine.actionIndex = 3;
  engine.state = "working";
  engine.transitionKind = null;
  engine.remaining = 9;
  engine.deadline = 9000;
  engine.shortTimeCalled = false;

  engine.tick(engine.token);
  engine.clear();
  assert.equal(events.at(-1).reason, "short-time");
  assert.equal(events.at(-1).isShortTime, true);
  engine.pause();
  engine.resume();
  engine.clear();
  assert.equal(events.at(-1).isShortTime, true);
  assert.equal(events.filter(event => event.reason === "short-time").length, 1);
});

test("Round 5 enters Short Time at ten seconds during the final Bottom cue", () => {
  const harness = createEngine();
  const { engine, events } = harness;
  engine.roundIndex = 4;
  engine.actionIndex = 3;
  engine.shortTimeCalled = false;
  engine.beginCurrentAction("bottom-next-action");
  engine.clear();

  harness.setNow(engine.deadline - 1750);
  engine.tick(engine.token);
  engine.clear();
  assert.equal(engine.roundRemaining, 10);
  assert.equal(events.some(event => event.reason === "short-time"), true);
  assert.equal(events.findLast(event => event.reason === "short-time").isShortTime, true);
});

test("one shared engine accepts every supported discipline", () => {
  for (const discipline of ["wrestling", "boxing", "muay-thai", "mma", "submission-grappling"]) {
    const disciplinePlan = buildShadowTrainingPlan(resolveCombatTrainingPreset({ discipline }));
    const engine = new ShadowTrainingEngine(disciplinePlan);
    assert.equal(engine.plan.discipline, discipline);
    engine.destroy();
  }
});

test("Road2Champion and Path2Legend resolve the locked T0-T4 timing doctrine", () => {
  const expected = {
    road2champion: [45, 60, 75, 90, 120],
    path2legend: [60, 90, 120, 120, 180]
  };
  for (const [journey, durations] of Object.entries(expected)) {
    durations.forEach((roundDuration, tier) => {
      const preset = resolveCombatTrainingPreset({ journey, tier: `t${tier}`, discipline: "boxing" });
      const resolved = buildShadowTrainingPlan(preset);
      assert.equal(resolved.roundDuration, roundDuration);
      assert.deepEqual(resolved.rounds.map(round => round.roundDuration), Array(10).fill(roundDuration));
      assert.equal(resolved.shortTimeAt, 10);
    });
  }
});

test("discipline libraries retain their own Round 2-5 cues", () => {
  const firstLabels = Object.fromEntries(
    ["wrestling", "boxing", "muay-thai", "mma", "submission-grappling"].map(discipline => {
      const resolved = buildShadowTrainingPlan(resolveCombatTrainingPreset({ discipline }));
      return [discipline, resolved.rounds.flatMap(round => round.actions.map(action => action.label))];
    })
  );
  assert(firstLabels.boxing.includes("Double Jab"));
  assert(!firstLabels.boxing.includes("Penetration Step"));
  assert(firstLabels["muay-thai"].includes("Teep"));
  assert(firstLabels.mma.includes("Pummel"));
  assert(firstLabels["submission-grappling"].includes("Hip Escape"));
  assert(!firstLabels.wrestling.includes("Hip Escape"));
});

test("every discipline shares one offense-free Round 1 footwork foundation", () => {
  const disciplines = ["wrestling", "boxing", "muay-thai", "mma", "submission-grappling"];
  const roundOnes = disciplines.map(discipline =>
    resolveCombatTrainingPreset({ discipline }).rounds[0]
  );
  for (const roundOne of roundOnes) {
    assert.deepEqual(roundOne.actions, FOUNDATIONAL_FOOTWORK_ROUND.actions);
    assert.equal(roundOne.mode, "footwork");
    assert.equal(roundOne.actions.every(action => action[2] === "footwork"), true);
    assert.doesNotMatch(
      roundOne.actions.flatMap(action => action[4].spokenCommands).join(" "),
      /jab|cross|punch|kick|teep|knee|shot|shoot|attack|sprawl|pummel/i
    );
  }
});

test("foundational stance matrices are exact and Pivot means one quarter pivot", () => {
  assert.deepEqual(FOUNDATIONAL_FOOTWORK.stances.square,
    ["Left", "Right", "Circle Left", "Circle Right", "Quick Feet"]);
  assert.deepEqual(FOUNDATIONAL_FOOTWORK.stances.staggered,
    ["Forward", "Back", "Pivot", "Quick Feet"]);
  assert.deepEqual(FOUNDATIONAL_FOOTWORK.pivot, { label: "Pivot", turn: "quarter" });
});

test("Round 1 establishes stance and supports authored 1-, 2-, and 3-step cues", () => {
  const resolved = buildShadowTrainingPlan(resolveCombatTrainingPreset({ discipline: "mma" }));
  const roundOne = resolved.rounds[0];
  assert.deepEqual(roundOne.actions[0].spokenCommands, ["Square stance", "Left"]);
  assert.equal(roundOne.actions[0].command.activeStance, "square");
  assert.equal(roundOne.actions[1].command.activeStance, "square");
  assert.deepEqual(roundOne.actions[2].spokenCommands,
    ["Staggered stance", "Forward", "Back", "Pivot"]);
  assert.equal(roundOne.actions[2].command.activeStance, "staggered");
  assert.deepEqual(
    roundOne.actions.filter(action => !action.command.selfDirected)
      .map(action => action.command.movements.length),
    [1, 2, 3, 1]
  );
  assert.equal(roundOne.actions.at(-1).label, "Move Your Feet");
});

test("Round 1 exact duration holds for every journey and tier", () => {
  for (const journey of ["road2champion", "path2legend"]) {
    for (let tier = 0; tier <= 4; tier += 1) {
      const preset = resolveCombatTrainingPreset({ discipline: "boxing", journey, tier });
      const roundOne = buildShadowTrainingPlan(preset).rounds[0];
      assert.equal(roundOne.roundDuration, preset.roundDuration);
      assert.equal(roundOne.actions.reduce((sum, action) => sum + action.duration, 0), preset.roundDuration);
      assert.equal(roundOne.actions.every(action => action.transitionDuration === 0), true);
    }
  }
});

test("Rounds 2-5 remain authored by discipline", () => {
  const expected = {
    wrestling: ["level", "attack", "defense", "recovery"],
    boxing: ["straight-shots", "defense", "combine", "control"],
    "muay-thai": ["defense", "striking", "close-range", "control"],
    mma: ["entry", "defense", "connection", "control"],
    "submission-grappling": ["level", "attack", "defense", "grappling-recovery"]
  };
  for (const [discipline, ids] of Object.entries(expected)) {
    assert.deepEqual(resolveCombatTrainingPreset({ discipline }).rounds.slice(1).map(round => round.id), ids);
  }
});

test("Submission Grappling composes Wrestling structure but authors its own Round 5", () => {
  const wrestling = resolveCombatTrainingPreset({ discipline: "wrestling" });
  const grappling = resolveCombatTrainingPreset({ discipline: "submission-grappling" });
  assert.equal(grappling.derivedFrom, "wrestling");
  assert.deepEqual(grappling.rounds.slice(0, 4), wrestling.rounds.slice(0, 4));
  assert.notDeepEqual(grappling.rounds[4].actions, wrestling.rounds[4].actions);
  assert.deepEqual(
    grappling.rounds[4].actions.map(action => action[1]),
    ["Hip Escape", "Bridge", "Technical Stand Up", "Hip Escape"]
  );
});

test("resolver aliases launcher parameters and fails closed on unsupported values", () => {
  assert.equal(resolveCombatTrainingPreset({ track: "f8", tier: "T4" }).journey, "road2champion");
  assert.equal(resolveCombatTrainingPreset({ track: "f4", tier: "2" }).journey, "path2legend");
  assert.equal(resolveCombatTrainingPreset({ discipline: "kickboxing" }).discipline, "muay-thai");
  assert.throws(() => resolveCombatTrainingPreset({ discipline: "karate" }), /Unsupported discipline/);
  assert.throws(() => resolveCombatTrainingPreset({ tier: "t5" }), /Unsupported training tier/);
});

test("every discipline and rank produces an exact validated schedule", () => {
  const disciplines = ["wrestling", "boxing", "muay-thai", "mma", "submission-grappling"];
  const journeys = ["road2champion", "path2legend"];
  for (const discipline of disciplines) {
    for (const journey of journeys) {
      for (let tier = 0; tier <= 4; tier += 1) {
        const resolved = buildShadowTrainingPlan(resolveCombatTrainingPreset({
          discipline,
          journey,
          tier: `t${tier}`
        }));
        for (const round of resolved.rounds) {
          const actual = round.actions.reduce(
            (total, action) => total + action.duration + action.leadInDuration + action.transitionDuration,
            0
          );
          assert.equal(actual, round.roundDuration);
        }
      }
    }
  }
});

test("every Road2Champion T0 discipline resolves all five rounds to 45 seconds", () => {
  for (const discipline of ["wrestling", "boxing", "muay-thai", "mma", "submission-grappling"]) {
    const resolved = buildShadowTrainingPlan(resolveCombatTrainingPreset({
      discipline,
      journey: "road2champion",
      tier: "t0"
    }));
    assert.deepEqual(resolved.rounds.map(round => round.roundDuration), Array(10).fill(45));
  }
  assert.equal(plan.rounds[4].actions[0].duration, 8.25);
});

test("Short Time remains the final ten seconds for every rank duration", () => {
  for (const journey of ["road2champion", "path2legend"]) {
    for (let tier = 0; tier <= 4; tier += 1) {
      const resolvedPlan = buildShadowTrainingPlan(resolveCombatTrainingPreset({
        discipline: "boxing",
        journey,
        tier: `t${tier}`
      }));
      let now = 0;
      const events = [];
      const engine = new ShadowTrainingEngine(resolvedPlan, {
        now: () => now,
        onChange: view => events.push(view)
      });
      engine.roundIndex = 4;
      engine.actionIndex = engine.currentRound.actions.length - 1;
      engine.state = "working";
      engine.remaining = 10;
      engine.deadline = 10000;
      engine.shortTimeCalled = false;
      now = 0;
      engine.tick(engine.token);
      engine.clear();
      assert.equal(events.at(-1).reason, "short-time");
      assert.equal(events.at(-1).remaining, 10);
    }
  }
});

test("Rounds 6-10 repeat authored Rounds 1-5 in order", () => {
  assert.equal(plan.authoredRoundCount, 5);
  assert.equal(plan.sessionCycles, 2);
  assert.deepEqual(plan.rounds.map(round => round.sourceRoundNumber), [1, 2, 3, 4, 5, 1, 2, 3, 4, 5]);
  assert.deepEqual(plan.rounds.map(round => round.cycleNumber), [1, 1, 1, 1, 1, 2, 2, 2, 2, 2]);
  for (let index = 0; index < 5; index += 1) {
    assert.equal(plan.rounds[index].id, plan.rounds[index + 5].id);
    assert.equal(plan.rounds[index].purpose, plan.rounds[index + 5].purpose);
  }
});

test("each discipline repeats its own special Round 5 at Round 10", () => {
  const expected = {
    wrestling: ["Stand Up", "Switch", "Granby", "Stand Up"],
    boxing: ["Move Your Feet", "Double Jab", "Slip"],
    "muay-thai": ["Move Your Feet", "Jab", "Exit"],
    mma: ["Move Your Feet", "Pummel", "Exit"],
    "submission-grappling": ["Hip Escape", "Bridge", "Technical Stand Up", "Hip Escape"]
  };
  for (const [discipline, labels] of Object.entries(expected)) {
    const resolved = buildShadowTrainingPlan(resolveCombatTrainingPreset({ discipline }));
    assert.deepEqual(resolved.rounds[4].actions.map(action => action.label), labels);
    assert.deepEqual(resolved.rounds[9].actions.map(action => action.label), labels);
  }
});

test("recovery duration resolves by journey and tier", () => {
  const road = [45, 45, 45, 45, 60];
  const path = [60, 60, 60, 60, 60];
  road.forEach((restDuration, tier) => {
    assert.equal(resolveCombatTrainingPreset({ journey: "road2champion", tier }).restDuration, restDuration);
  });
  path.forEach((restDuration, tier) => {
    assert.equal(resolveCombatTrainingPreset({ journey: "path2legend", tier }).restDuration, restDuration);
  });
});

test("ten-round session duration contains ten recovery intervals plus one preroll", () => {
  const cases = [
    ["road2champion", [900, 1050, 1200, 1350, 1800]],
    ["path2legend", [1200, 1500, 1800, 1800, 2400]]
  ];
  for (const [journey, expectedWithoutPreroll] of cases) {
    expectedWithoutPreroll.forEach((expected, tier) => {
      const resolved = buildShadowTrainingPlan(resolveCombatTrainingPreset({
        discipline: "boxing", journey, tier
      }));
      const work = resolved.rounds.reduce((sum, round) => sum + round.roundDuration, 0);
      assert.equal(work + 10 * resolved.restDuration, expected);
      assert.equal(work + 10 * resolved.restDuration + resolved.prerollDuration, expected + 5);
    });
  }
});

test("one Start runs continuously through Round 10 and completes after ten recoveries", () => {
  for (const discipline of ["wrestling", "boxing", "muay-thai", "mma", "submission-grappling"]) {
    const disciplinePlan = buildShadowTrainingPlan(resolveCombatTrainingPreset({ discipline }));
    const harness = createEngine(disciplinePlan);
    harness.engine.start();
    harness.engine.clear();
    let phaseCount = 0;
    while (harness.engine.state !== "completed" && phaseCount < 200) {
      harness.finishPhase();
      phaseCount += 1;
    }
    assert.equal(harness.engine.state, "completed");
    assert.equal(harness.engine.roundIndex, 9);
    assert.equal(harness.events.filter(event => event.reason === "rest-started").length, 10);
    assert.equal(harness.events.filter(event => event.reason === "session-start").length, 1);
  }
});
