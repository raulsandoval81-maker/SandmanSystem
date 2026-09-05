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

function createEngine() {
  let now = 0;
  const events = [];
  const engine = new ShadowTrainingEngine(plan, {
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
  assert.equal(plan.rounds.length, 5);
  assert.deepEqual(plan.rounds.map(round => round.roundDuration), [45, 45, 45, 45, 45]);
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
  engine.roundIndex = 0;
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
  engine.roundIndex = 0;
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

test("Rounds 1-4 retain final Hand Fight transitions before Recovery", () => {
  for (let roundIndex = 0; roundIndex < 4; roundIndex += 1) {
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

test("Round 5 Bottom motion has no Hand Fight and completes after final work", () => {
  const harness = createEngine();
  const { engine, events } = harness;
  engine.roundIndex = 4;
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

  assert.equal(engine.state, "completed");
  assert.equal(events.filter(event => event.reason === "transition-started").length, 0);
  assert.deepEqual(
    plan.rounds[4].actions.map(action => action.label),
    ["Stand Up", "Switch", "Granby", "Stand Up"]
  );
  assert.equal(plan.rounds[4].commandPattern.executionCommand, "Hit it");
  assert.doesNotMatch(JSON.stringify(plan.rounds[4]), /Oklahoma/i);
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
      assert.deepEqual(resolved.rounds.map(round => round.roundDuration), Array(5).fill(roundDuration));
      assert.equal(resolved.shortTimeAt, 10);
    });
  }
});

test("discipline libraries resolve their own foundational cues", () => {
  const firstLabels = Object.fromEntries(
    ["wrestling", "boxing", "muay-thai", "mma", "submission-grappling"].map(discipline => {
      const resolved = buildShadowTrainingPlan(resolveCombatTrainingPreset({ discipline }));
      return [discipline, resolved.rounds.flatMap(round => round.actions.map(action => action.label))];
    })
  );
  assert.equal(firstLabels.wrestling[0], "Move Your Feet");
  assert(firstLabels.boxing.includes("Double Jab"));
  assert(!firstLabels.boxing.includes("Penetration Step"));
  assert(firstLabels["muay-thai"].includes("Teep"));
  assert(firstLabels.mma.includes("Pummel"));
  assert(firstLabels["submission-grappling"].includes("Hip Escape"));
  assert(!firstLabels.wrestling.includes("Hip Escape"));
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
    assert.deepEqual(resolved.rounds.map(round => round.roundDuration), [45, 45, 45, 45, 45]);
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
