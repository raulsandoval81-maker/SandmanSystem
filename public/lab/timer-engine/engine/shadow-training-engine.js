const ACTIVE = new Set(["preparing", "working", "transitioning", "resting"]);

export class ShadowTrainingEngine {
  constructor(plan, { onChange = () => {}, now = () => performance.now() } = {}) {
    this.plan = plan; this.onChange = onChange; this.now = now;
    this.token = 0; this.timer = null; this.state = "idle"; this.resumeState = null;
    this.transitionKind = null; this.bottomCountdown = null;
    this.roundIndex = 0; this.actionIndex = 0; this.remaining = plan.rounds[0].actions[0].duration;
    this.shortTimeCalled = false;
    this.emit("initialized");
  }
  start() {
    this.cancel(); this.roundIndex = 0; this.actionIndex = 0; this.shortTimeCalled = false;
    this.transitionKind = null; this.bottomCountdown = null;
    this.enter("preparing", this.plan.prerollDuration, "session-start");
  }
  pause() {
    if (!ACTIVE.has(this.state)) return;
    this.sync(); this.pausedDisplayRemaining = this.roundRemaining;
    this.resumeState = this.state; this.clear(); this.state = "paused"; this.emit("paused");
  }
  resume() {
    if (this.state !== "paused") return;
    const state = this.resumeState; this.resumeState = null; this.enter(state, this.remaining, "resumed");
  }
  stop() {
    if (![...ACTIVE, "paused"].includes(this.state)) return;
    this.cancel(); this.state = "stopped"; this.remaining = 0; this.emit("stopped");
  }
  reset() {
    this.cancel(); this.roundIndex = 0; this.actionIndex = 0; this.state = "idle";
    this.shortTimeCalled = false; this.transitionKind = null; this.bottomCountdown = null;
    this.remaining = this.currentAction.duration; this.emit("reset");
  }
  destroy() { this.cancel(); }
  handleVisibilityChange(hidden) { if (!hidden && ACTIVE.has(this.state)) this.tick(this.token); }
  enter(state, seconds, reason) {
    this.clear(); this.state = state; this.remaining = Math.max(0, seconds);
    this.deadline = this.now() + this.remaining * 1000; this.emit(reason);
    const token = this.token; this.timer = setInterval(() => this.tick(token), 100);
  }
  tick(token) {
    if (token !== this.token || !ACTIVE.has(this.state)) return;
    this.sync();
    let emitted = false;
    const countdown = this.currentBottomCountdown;
    if (countdown !== null && countdown !== this.bottomCountdown) {
      this.bottomCountdown = countdown; this.emit("bottom-countdown"); emitted = true;
    }
    if (["working", "transitioning"].includes(this.state) &&
        !this.shortTimeCalled && this.roundRemaining <= this.plan.shortTimeAt) {
      this.shortTimeCalled = true; this.emit("short-time"); emitted = true;
    }
    if (!emitted) this.emit("tick");
    if (this.remaining <= 0) this.advance(token);
  }
  sync() { this.remaining = Math.max(0, (this.deadline - this.now()) / 1000); }
  advance(token) {
    if (token !== this.token) return;
    if (this.state === "preparing") return this.beginCurrentAction("work-started");
    if (this.state === "working") {
      if (this.currentRound.mode === "bottom") return this.afterBottomWork();
      if (this.currentAction.transitionDuration <= 0) return this.afterTransition();
      this.transitionKind = "neutral";
      return this.enter("transitioning", this.currentAction.transitionDuration, "transition-started");
    }
    if (this.state === "transitioning") {
      if (this.transitionKind === "bottom-lead-in") {
        this.bottomCountdown = null;
        return this.enter("working", this.currentAction.duration, "bottom-action-started");
      }
      return this.afterTransition();
    }
    if (this.state === "resting") {
      if (this.roundIndex === this.plan.rounds.length - 1) return this.complete();
      this.roundIndex += 1; this.actionIndex = 0; this.shortTimeCalled = false;
      return this.beginCurrentAction("round-started");
    }
  }
  beginCurrentAction(reason) {
    if (this.currentRound.mode !== "bottom") {
      this.transitionKind = null;
      return this.enter("working", this.currentAction.duration, reason);
    }
    this.transitionKind = "bottom-lead-in";
    this.bottomCountdown = this.currentRound.commandPattern.countdown[0];
    return this.enter("transitioning", this.currentAction.leadInDuration, "bottom-cue-started");
  }
  afterBottomWork() {
    if (this.actionIndex === this.currentRound.actions.length - 1) {
      this.actionIndex = 0;
      return this.enter("resting", this.plan.restDuration, "rest-started");
    }
    this.actionIndex += 1;
    return this.beginCurrentAction("bottom-next-action");
  }
  afterTransition() {
    if (this.actionIndex < this.currentRound.actions.length - 1) {
      this.actionIndex += 1;
      return this.enter("working", this.currentAction.duration, "action-started");
    }
    this.actionIndex = 0; this.enter("resting", this.plan.restDuration, "rest-started");
  }
  complete() { this.clear(); this.state = "completed"; this.remaining = 0; this.emit("completed"); }
  cancel() { this.token += 1; this.clear(); }
  clear() { if (this.timer !== null) clearInterval(this.timer); this.timer = null; }
  get currentRound() { return this.plan.rounds[this.roundIndex]; }
  get currentAction() { return this.currentRound.actions[this.actionIndex]; }
  get roundRemaining() {
    if (!["working", "transitioning"].includes(this.state)) return this.remaining;
    if (this.currentRound.mode === "bottom") {
      const later = this.currentRound.actions.slice(this.actionIndex + 1)
        .reduce((sum, action) => sum + action.leadInDuration + action.duration, 0);
      const currentWork = this.state === "transitioning" ? this.currentAction.duration : 0;
      return this.remaining + currentWork + later;
    }
    const later = this.currentRound.actions.slice(this.actionIndex + 1)
      .reduce((sum, action) => sum + action.duration + action.transitionDuration, 0);
    const currentTransition = this.state === "working" ? this.currentAction.transitionDuration : 0;
    return this.remaining + currentTransition + later;
  }
  get isShortTime() {
    return ["working", "transitioning"].includes(this.state) &&
      this.roundRemaining <= this.plan.shortTimeAt;
  }
  get currentBottomCountdown() {
    if (this.state !== "transitioning" || this.transitionKind !== "bottom-lead-in") return null;
    const countdown = this.currentRound.commandPattern.countdown;
    const index = Math.min(countdown.length - 1, Math.max(0,
      Math.floor(this.currentAction.leadInDuration - this.remaining)));
    return countdown[index];
  }
  spokenCommands(reason) {
    if (["work-started", "round-started", "action-started"].includes(reason)) {
      return this.currentAction.spokenCommands || [this.currentAction.label];
    }
    if (["bottom-cue-started", "bottom-countdown"].includes(reason)) {
      return [String(this.currentBottomCountdown)];
    }
    if (reason === "bottom-action-started") {
      return [this.currentAction.label, this.currentRound.commandPattern.executionCommand];
    }
    if (reason === "transition-started") {
      return [this.plan.transition?.spokenCommand || this.plan.transitionCommand.label];
    }
    return [];
  }
  snapshot(reason) {
    return Object.freeze({ reason, state: this.state,
      remaining: this.state === "paused" ? this.pausedDisplayRemaining :
        (["working", "transitioning"].includes(this.state) ? this.roundRemaining : this.remaining),
      roundIndex: this.roundIndex, roundNumber: this.roundIndex + 1,
      roundCount: this.plan.rounds.length, round: this.currentRound, action: this.currentAction,
      isShortTime: this.isShortTime, transition: this.plan.transition,
      transitionCommand: this.plan.transitionCommand, transitionKind: this.transitionKind,
      bottomCountdown: this.currentBottomCountdown,
      spokenCommands: Object.freeze(this.spokenCommands(reason)), recovery: this.plan.recovery });
  }
  emit(reason) { this.onChange(this.snapshot(reason)); }
}
