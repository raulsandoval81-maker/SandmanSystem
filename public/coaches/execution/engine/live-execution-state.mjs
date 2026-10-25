const whole = value => Math.max(0, Math.floor(Number(value) || 0));
const id = value => String(value ?? "").trim();

export function blockDurationSeconds(block = {}) {
  return Math.round(Math.max(0, Number(block.minutes) || 0) * 60);
}

export function materializeLiveState(state = {}, nowMs = Date.now(), playlist = []) {
  const index = Math.min(whole(state.index), Math.max(0, playlist.length - 1));
  const durationSeconds = blockDurationSeconds(playlist[index]);
  const anchored = state.status === "running"
    ? whole((nowMs - Number(state.anchorEpochMs || nowMs)) / 1000) : 0;
  const elapsedSeconds = Math.min(durationSeconds, whole(state.elapsedSeconds) + anchored);
  return { ...state, index, elapsedSeconds, durationSeconds,
    remainingSeconds: Math.max(0, durationSeconds - elapsedSeconds) };
}

export function transitionLiveState(state = {}, command, playlist = [], nowMs = Date.now()) {
  if (!playlist.length) throw new Error("A saved practice plan is required.");
  const current = materializeLiveState(state, nowMs, playlist);
  const status = id(current.status) || "ready";
  let next = { ...current };
  let evidence = null;
  const record = disposition => ({
    sequence: whole(current.revision) + 1,
    blockId: id(playlist[current.index]?.slot || playlist[current.index]?.blockId || playlist[current.index]?.title),
    blockIndex: current.index,
    disposition,
    elapsedSeconds: current.elapsedSeconds,
    atEpochMs: nowMs,
  });
  if (command === "start" && status === "ready") next = { ...current, status:"running", index:0, elapsedSeconds:0, anchorEpochMs:nowMs };
  else if (command === "pause" && status === "running") next = { ...current, status:"paused", anchorEpochMs:0 };
  else if (command === "resume" && status === "paused") next = { ...current, status:"running", anchorEpochMs:nowMs };
  else if (["advance","skip"].includes(command) && ["running","paused"].includes(status)) {
    if (command === "advance" && current.remainingSeconds > 0) throw new Error("The active block still has time remaining.");
    evidence = record(command === "advance" ? "completed" : "skipped");
    const index = current.index + 1;
    next = index >= playlist.length
      ? { ...current, status:"completed", elapsedSeconds:current.durationSeconds, anchorEpochMs:0 }
      : { ...current, status, index, elapsedSeconds:0, anchorEpochMs:status === "running" ? nowMs : 0 };
  } else if (command === "back" && ["running","paused"].includes(status)) {
    evidence = record("left-for-previous");
    next = { ...current, index:Math.max(0,current.index - 1), elapsedSeconds:0, anchorEpochMs:status === "running" ? nowMs : 0 };
  } else if (command === "repeat" && ["running","paused"].includes(status)) {
    evidence = record("repeated");
    next = { ...current, elapsedSeconds:0, anchorEpochMs:status === "running" ? nowMs : 0 };
  } else if (command === "reset") {
    evidence = record("reset");
    next = { ...current, status:"ready", index:0, elapsedSeconds:0, anchorEpochMs:0 };
  } else throw new Error(`Command ${command} is not valid while ${status}.`);
  return { state:{ ...next, revision:whole(current.revision) + 1, updatedAtEpochMs:nowMs }, evidence };
}

export function currentAndNextActivity(state = {}, playlist = [], nowMs = Date.now()) {
  const live = materializeLiveState(state, nowMs, playlist);
  const block = playlist[live.index] || null;
  const drills = Array.isArray(block?.drillBlocks) ? block.drillBlocks.filter(item => Number(item?.minutes) > 0) : [];
  let cursor = 0;
  let currentDrill = null;
  let nextDrill = null;
  for (let index = 0; index < drills.length; index += 1) {
    cursor += blockDurationSeconds(drills[index]);
    if (live.elapsedSeconds < cursor) { currentDrill = drills[index]; nextDrill = drills[index + 1] || null; break; }
  }
  return { live, block, currentActivity:currentDrill || block?.cards?.[0] || null,
    nextActivity:nextDrill || block?.cards?.[currentDrill ? 0 : 1] || playlist[live.index + 1] || null };
}

export function totalPracticeProgress(state = {}, playlist = [], nowMs = Date.now()) {
  const live = materializeLiveState(state, nowMs, playlist);
  const total = playlist.reduce((sum, block) => sum + blockDurationSeconds(block), 0);
  const prior = playlist.slice(0, live.index).reduce((sum, block) => sum + blockDurationSeconds(block), 0);
  const elapsed = Math.min(total, prior + live.elapsedSeconds);
  return { elapsedSeconds:elapsed, totalSeconds:total, ratio:total ? elapsed / total : 0 };
}
