document.addEventListener("DOMContentLoaded", () => {
  // =========================
  // ELEMENTS
  // =========================
  const clockEl = document.getElementById("clock");
  const statusEl = document.getElementById("status");
  const roundLabelEl = document.getElementById("roundLabel");
  const intervalPill = document.getElementById("intervalPill");
  const intervalClock = document.getElementById("intervalClock");
  const roundFlashEl = document.getElementById("roundFlash");
  const coachFeedEl = document.getElementById("coachFeed");

  const startBtn = document.getElementById("startBtn");
  const stopBtn = document.getElementById("stopBtn");
  const resetBtn = document.getElementById("resetBtn");
  const stageToggle = document.getElementById("stageToggle");

  // KEEP MODE BUTTON / CONTROL
  const modeSelect = document.getElementById("modeSelect");

  const musicToggleEl = document.getElementById("musicToggle");
  const musicSrcEl = document.getElementById("musicSrc");
  const musicVolumeEl = document.getElementById("musicVolume");

  const voiceEl = document.getElementById("voiceToggle");
  const volumeEl = document.getElementById("volume");
  const colorMode = document.getElementById("colorMode");

  const settings = document.getElementById("settings");
  const gearBtn = document.getElementById("gearBtn");
  const closeSettings = document.getElementById("closeSettings");
  const defaultsBtn = document.getElementById("defaultsBtn");
  const themeToggle = document.getElementById("themeToggle");

  const trainerTrackEl = document.getElementById("trainerTrack");
  const trainerTierEl = document.getElementById("trainerTier");
  const trainerModeEl = document.getElementById("trainerMode");
  const trainerSequenceEl = document.getElementById("trainerSequence");

  // =========================
  // VOICE PACK
  // =========================
  const VOICE = {
    ready: "/timer-engine/audio/ready.mp3",
    go: "/timer-engine/audio/go.mp3",
    short: "/timer-engine/audio/short-time.mp3",
    time: "/timer-engine/audio/time.mp3",
    bounce: "/timer-engine/audio/boxers-bounce.mp3",
    getReady: "/timer-engine/audio/get-ready.mp3",

    slowSlow: "/timer-engine/audio/slow-feet-slow-shots.mp3",
    slowFast: "/timer-engine/audio/slow-feet-fast-shots.mp3",
    fastSlow: "/timer-engine/audio/fast-feet-slow-shots.mp3",
    fastFast: "/timer-engine/audio/fast-feet-fast-shots.mp3",
    whistleStarts: "/timer-engine/audio/whistle-starts.mp3",

    setup: "/timer-engine/audio/set-up.mp3",
    shot: "/timer-engine/audio/shot.mp3",
    stand: "/timer-engine/audio/stand-up.mp3",
    switch: "/timer-engine/audio/switch.mp3",
    tripod: "/timer-engine/audio/tripod.mp3",
    knee: "/timer-engine/audio/knee-slide.mp3"
  };

  // =========================
  // TIMER CONFIG
  // =========================
  const TIMER_CONFIG = {
    // =========================
    // FOUNDRY 4 (TEENS / ADULTS)
    // =========================
    f4: {
      t0: { rank: "Apprentice", roundSec: 90,  restSec: 45, rounds: 5 },
      t1: { rank: "Warrior",    roundSec: 120,  restSec: 45, rounds: 5 },
      t2: { rank: "Champion",   roundSec: 180,  restSec: 45, rounds: 5 },
      t3: { rank: "Veteran",    roundSec: 240,  restSec: 45, rounds: 5 },
      t4: { rank: "Legend",     roundSec: 240,  restSec: 45, rounds: 5 }
    },

    // =========================
    // FOUNDRY 8 (YOUTH)
    // =========================
    f8: {
      t0: { rank: "Shadow",     roundSec: 45,  restSec: 30, rounds: 5 },
      t1: { rank: "Recruit",    roundSec: 45,  restSec: 30, rounds: 5 },
      t2: { rank: "Combatant",  roundSec: 60,  restSec: 30, rounds: 5 },
      t3: { rank: "Competitor", roundSec: 60,  restSec: 30, rounds: 5 },
      t4: { rank: "Warrior",    roundSec: 90,  restSec: 30, rounds: 5 },
      t5: { rank: "Champion",   roundSec: 90,  restSec: 30, rounds: 5 },
      t6: { rank: "Veteran",    roundSec: 120, restSec: 30, rounds: 5 },
      t7: { rank: "Hero",       roundSec: 120, restSec: 30, rounds: 5 },
    }
  };

  const R5_CONFIG = {
    f8: {
      t0: { mode: "single", start: "countdown3", moves: ["oldSchool"] },
      t1: { mode: "single", start: "countdown3", moves: ["oldSchool", "sitOut"] },
      t2: {
        mode: "cycle",
        start: "countdown3",
        cycles: {
          A: ["oldSchool"],
          B: ["sitOut", "sitOutSwitch", "sitOutHip"],
          C: ["quadpod"]
        }
      },
      t3: {
        mode: "cycle",
        start: "silent",
        cycles: {
          A: ["oldSchool"],
          B: ["sitOut", "sitOutSwitch", "sitOutHip"],
          C: ["quadpod", "quadpodFeet", "quadpodCircle"],
          D: ["sealOut"]
        }
      }
    }
  };

  const TEMPO_MAP = {
  // Foundry 8
  shadow_f8: 6,
  recruit_f8: 6,

  combatant_f8: 5,
  competitor_f8: 5,

  warrior_f8: 4,
  champion_f8: 4,

  commander_f8: 3,
  hero_f8: 3,

  // Foundry 4
  apprentice_f4: 5,
  warrior_f4: 4,
  champion_f4: 4,
  veteran_f4: 3,
  legend_f4: 3,
};


  // =========================
  // COMBAT CONFIG
  // =========================
  const params = new URLSearchParams(window.location.search);

  const athleteId =
    params.get("athleteId") ||
    params.get("id") ||
    "";

  const track =
    params.get("track") ||
    (athleteId.startsWith("F8") ? "f8" :
     athleteId.startsWith("F4") ? "f4" : "");

  const tier = params.get("tier") || "t0";

  if (!track || !tier || !TIMER_CONFIG[track]?.[tier]) {
    throw new Error(`Invalid timer config. track=${track} tier=${tier} athleteId=${athleteId}`);
  }

  const cfg = TIMER_CONFIG[track][tier];

  const COMBAT = {
    active: true,
    track,
    tier,
    rank: cfg.rank,
    sequenceBucket: "combat",
    rounds: cfg.rounds,
    roundSec: cfg.roundSec,
    restSec: cfg.restSec,

    roundLabels: [
      { key: "slowSlow", label: "Slow feet, slow shots" },
      { key: "slowFast", label: "Slow feet, fast shots" },
      { key: "fastSlow", label: "Fast feet, slow shots" },
      { key: "fastFast", label: "Fast feet, fast shots" },
      { key: "whistleStarts", label: "Whistle starts" }
    ],

    shortTime: "Short time",
    restLabel: "BOXER'S BOUNCE - SHADOW ROPE"
  };

  // =========================
  // STATE
  // =========================
  const S = {
    running: false,
    paused: false,
    raf: null,
    lastTick: 0,
    round: 1,
    rounds: cfg.rounds,
    tLeft: cfg.roundSec,
    inRest: false,
    restLeft: cfg.restSec,
    shortCalled: false,
    preRolling: false,
    breatheCalled: false
  };

  // =========================
  // ROUND 5 ENGINE
  // =========================
  const R5_LABELS = {
    oldSchool: "Old school",
    sitOut: "Sit out",
    sitOutSwitch: "Sit out switch",
    sitOutHip: "Sit out hip heist",
    quadpod: "Quadpod",
    quadpodFeet: "Feet",
    quadpodCircle: "Circle",
    sealOut: "Seal out",

    oneForOne: "1 for 1",
    oneForTwo: "1 for 2",
    oneForFive: "1 for 5",
    twoForOne: "2 for 1",
    twoForTwo: "2 for 2",
    twoForFive: "2 for 5"
  };

  // =========================
  // AUDIO STATE
  // =========================
  let audioCtx = null;
  let voiceAudio = null;
  let musicAudio = null;

  // =========================
  // UTILS
  // =========================
  function fmt(sec) {
    sec = Math.max(0, Math.ceil(sec));
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function log(_line) {
    return; // disabled for athlete view
  }

  function setStatus(txt) {
    if (statusEl) statusEl.textContent = txt;
  }

  function setBodyColor(mode) {
    document.body.classList.remove("go", "short", "stop");
    if (!colorMode?.checked) return;
    if (mode) document.body.classList.add(mode);
  }

  function getRoundData(roundNum) {
    return COMBAT.roundLabels[roundNum - 1] || { key: "", label: `Round ${roundNum}` };
  }

function updateRoundLabel() {
  if (!roundLabelEl) return;

  if (S.inRest) {
    roundLabelEl.textContent = COMBAT.restLabel.toUpperCase();
    return;
  }

  const rd = getRoundData(S.round);
  roundLabelEl.textContent = rd.label.toUpperCase();
}

const TIP_ROTATION = [
  "MOVE YOUR FEET",
  "STAY LOW",
  "HANDS FIRST",
  "NO FREE POINTS",
  "BREATHE AND WORK"
];

let coachFeedTimer = null;
let tipIndex = 0;

function getTempoKey() {
  const rank = (COMBAT.rank || "").toLowerCase();
  const track = COMBAT.track;

  return `${rank}_${track}`;
}

function getTempoInterval() {
  const key = getTempoKey();
  return TEMPO_MAP[key] || 6; // default fallback
}
function setCoachFeed(text) {
  if (!coachFeedEl) return;

  coachFeedEl.textContent = String(text || "").toUpperCase();
  coachFeedEl.dataset.mode = "coach";

  if (coachFeedTimer) clearTimeout(coachFeedTimer);

  coachFeedTimer = setTimeout(() => {
    coachFeedEl.dataset.mode = "";
    showNextTip();
  }, 3500); // longer so athletes actually see it
}

function showNextTip() {
  if (!coachFeedEl) return;

  // DO NOT override active coach message
  if (coachFeedEl.dataset.mode === "coach") return;

  const tip = TIP_ROTATION[tipIndex % TIP_ROTATION.length];
  tipIndex += 1;

  coachFeedEl.textContent = `TIP: ${tip}`;
  coachFeedEl.dataset.mode = "tip";
}

function clearCoachFeed() {
  if (!coachFeedEl) return;
  if (coachFeedTimer) clearTimeout(coachFeedTimer);
  coachFeedEl.dataset.mode = "";
  coachFeedEl.textContent = "";
}

  function modeLabel(v) {
    if (v === "silent") return "Silent";
    if (v === "voice") return "Voice Calls";
    if (v === "coach") return "Coach Calls";
    if (v === "music") return "Music";
    if (v === "musicCoach") return "Music + Coach";
    return "—";
  }

  function setTrainerPanel() {
    if (trainerTrackEl) trainerTrackEl.textContent = String(COMBAT.track).toUpperCase();
    if (trainerTierEl) trainerTierEl.textContent = COMBAT.rank;
    if (trainerModeEl) trainerModeEl.textContent = modeLabel(currentMode());
    if (trainerSequenceEl) trainerSequenceEl.textContent = COMBAT.sequenceBucket;
  }

  function currentMode() {
    return modeSelect?.value || "coach";
  }

  // STRUCTURE LAYER ALWAYS TALKS
  function structureCueEnabled() {
    return true;
  }

  // COACH LAYER STACKS ON TOP
  function coachCueEnabled() {
    const mode = currentMode();
    return mode === "coach" || mode === "musicCoach";
  }

  // MUSIC IS SEPARATE
  function musicEnabled() {
    const mode = currentMode();
    return (mode === "music" || mode === "musicCoach") && !!musicToggleEl?.checked;
  }

  function getVolume() {
    return Number(volumeEl?.value || 0.9);
  }

  function getMusicVolume() {
    return Number(musicVolumeEl?.value || 0.6);
  }

  // =========================
  // AUDIO HELPERS
  // =========================
function unlockSpeech() {
  try {
    const synth = window.speechSynthesis;
    if (!synth) return;

    synth.cancel();
    synth.resume();

    const voices = synth.getVoices();
    const u = new SpeechSynthesisUtterance(" ");
    u.volume = 0.01;
    if (voices && voices.length) {
      u.voice = voices.find(v => /en/i.test(v.lang)) || voices[0];
    }
    synth.speak(u);
  } catch (err) {
    console.warn("speech unlock failed", err);
  }
}
  function stopVoiceAudio() {
    if (voiceAudio) {
      voiceAudio.pause();
      voiceAudio.currentTime = 0;
      voiceAudio = null;
    }
    try {
      window.speechSynthesis.cancel();
    } catch (_) {}
  }

  function stopMusic() {
    if (musicAudio) {
      musicAudio.pause();
      musicAudio.currentTime = 0;
    }
  }

  function startMusic() {
    if (!musicEnabled()) return;

    const src = musicSrcEl?.value?.trim();
    if (!src) {
      log("Music mode selected but no music source set.");
      return;
    }

    const resolved = new URL(src, window.location.origin).href;
    if (!musicAudio || musicAudio.src !== resolved) {
      musicAudio = new Audio(src);
    }

    musicAudio.loop = true;
    musicAudio.volume = getMusicVolume();
    musicAudio.play().catch(() => {
      log("Music failed to start.");
    });
  }

  function flashRoundCommand(text) {
    if (!roundFlashEl || !text) return;

    roundFlashEl.textContent = text;
    roundFlashEl.classList.remove("show");

    void roundFlashEl.offsetWidth;

    roundFlashEl.classList.add("show");
  }

  function tone(ms = 180, freq = 1300, vol = getVolume()) {
    try {
      audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();

      osc.connect(gain);
      gain.connect(audioCtx.destination);

      const t = audioCtx.currentTime;
      osc.type = "sine";
      osc.frequency.value = freq;

      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.linearRampToValueAtTime(vol, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + ms / 1000);

      osc.start(t);
      osc.stop(t + ms / 1000);
    } catch (err) {
      console.warn("tone failed", err);
    }
  }


  function whistle() {
    tone(210, 1450);
  }

  function bellStart() {
    tone(180, 720);
    setTimeout(() => tone(160, 930), 180);
  }

  function bellEnd() {
    tone(220, 640);
    setTimeout(() => tone(220, 640), 230);
  }

function playVoiceKey(key, fallbackText = "") {
  if (!structureCueEnabled()) return;
  speakFallback(fallbackText || key);
}
  function speakFallback(text) {
  if (!structureCueEnabled() || !text) return;

  try {
    const synth = window.speechSynthesis;
    if (!synth) return;

    synth.resume();

    const voices = synth.getVoices();
    const voice =
      voices.find(v => /Alex|Samantha|Daniel|Victoria|Google/i.test(v.name)) ||
      voices.find(v => /en/i.test(v.lang)) ||
      voices[0];

    const utter = new SpeechSynthesisUtterance(String(text));
    utter.voice = voice;
    utter.rate = 1.0;
    utter.pitch = 1.0;
    utter.volume = getVolume();

    synth.speak(utter);
  } catch (err) {
    console.warn("speech fallback failed", err);
  }
}
  function coachCall(key, text) {
    if (!coachCueEnabled()) return;
    speakFallback(text || key);
  }
    // =========================
  // TIMER FLOW HELPERS
  // =========================
  function resetRound5() {
    r5Index = 0;
    r5CycleKeys = [];
    r5CyclePos = 0;
    r5Timer = 0;
  }

  function hardStopVisual() {
    setBodyColor("stop");
  }

  function goVisual() {
    setBodyColor("go");
  }

  function shortVisual() {
    setBodyColor("short");
  }
async function preRoll(sec = 5) {
  S.preRolling = true;
  setStatus("ready");
  hardStopVisual();
  unlockSpeech();

  return new Promise((resolve) => {
    let t = sec;
    if (clockEl) clockEl.textContent = String(t);

    if (structureCueEnabled()) {
      speakFallback(String(t));
    }

    const id = setInterval(() => {
      t -= 1;

      if (t > 0) {
        if (clockEl) clockEl.textContent = String(t);
        if (structureCueEnabled()) speakFallback(String(t));
        return;
      }

      clearInterval(id);
      S.preRolling = false;
      bellStart();
      resolve();
    }, 1000);
  });
}
async function sayRoundStart(roundNum) {
  const rd = getRoundData(roundNum);

  setStatus("RUNNING");
  goVisual();
  flashRoundCommand(rd.label);

  if (structureCueEnabled()) {
    playVoiceKey(rd.key, rd.label);
  }
}

function sayShortTime() {
  setStatus("SHORT TIME");
  shortVisual();
  setCoachFeed("Short time");

  if (structureCueEnabled()) {
    speakFallback(COMBAT.shortTime);
  }
}

function sayRoundEnd() {
  hardStopVisual();

  if (structureCueEnabled()) {
    playVoiceKey("time", "Time");
  }

  bellEnd();
}

async function sayRestStart() {
  hardStopVisual();
  setStatus(`RECOVER • ${COMBAT.rank.toUpperCase()}`);
  setCoachFeed("Boxer's bounce, shadow rope");

  if (structureCueEnabled()) {
    speakFallback("Boxer's");
    await sleep(350);
    speakFallback("bounce");
  }
}
function sayRestReady() {
  setStatus("READY");
  setCoachFeed("Get ready");

  if (structureCueEnabled()) {
    playVoiceKey("getReady", "Get ready");
  }
}
let r5Index = 0;
  let r5CycleKeys = [];
  let r5CyclePos = 0;
  let r5Timer = 0;
  const R5_INTERVAL = 6;
  let tempoTimer = 0;

let r5Busy = false;

async function runRound5() {
  if (r5Busy) return;
  r5Busy = true;

  try {
    const track = COMBAT.track;
    const tier = COMBAT.tier;
    const cfg = R5_CONFIG[track][tier];
    if (!cfg) return;

    const move =
      cfg.mode === "cycle"
        ? (() => {
            if (!r5CycleKeys.length) {
              r5CycleKeys = Object.keys(cfg.cycles);
            }
            const key = r5CycleKeys[r5CyclePos % r5CycleKeys.length];
            const moves = cfg.cycles[key];
            r5CyclePos++;
            return moves[r5Index % moves.length];
          })()
        : cfg.moves
        ? cfg.moves[r5Index % cfg.moves.length]
        : Object.values(cfg.cycles).flat()[
            Math.floor(Math.random() * Object.values(cfg.cycles).flat().length)
          ];

    r5Index++;

    await runStart(cfg.start);

    if (coachCueEnabled()) {
      if (move === "oldSchool" && r5Index % 4 === 1) {
        setCoachFeed("Old school stand-up");
       coachCall("call", "Old school stand-up");

      } else if (move === "oldSchool") {
        
       setCoachFeed("Stand-up");
       coachCall("call", "Stand-up");
      } else {

        setCoachFeed(R5_LABELS[move]);
        coachCall("call", R5_LABELS[move]);
      }
    }

    await sleep(1200);

    if (structureCueEnabled()) speakFallback("Reset");
    await sleep(800);

    if (structureCueEnabled()) speakFallback("3");
    await sleep(600);

    if (structureCueEnabled()) speakFallback("2");
    await sleep(600);

    if (structureCueEnabled()) speakFallback("1");
    await sleep(600);

    whistle();
  } finally {
    r5Busy = false;
  }
}
  // =========================
  // ENGINE
  // =========================
  async function start() {
    if (S.running || S.preRolling) return;

    unlockSpeech();

    S.running = true;
    S.paused = false;
    S.round = 1;
    updateRoundPill();
    S.tLeft = COMBAT.roundSec;
    S.inRest = false;
    S.restLeft = COMBAT.restSec;
    S.restReadyCalled = false;
    S.shortCalled = false;
    resetRound5();
tempoTimer = 0;
    stopMusic();
    if (musicEnabled()) startMusic();

    updateRoundLabel();
    await preRoll(5);
    await sayRoundStart(S.round);

    if (clockEl) clockEl.textContent = fmt(S.tLeft);
    log(`Start: ${COMBAT.rank} • Round 1 • ${getRoundData(1).label}`);

    S.lastTick = performance.now();
    tick();
  }

  async function runStart(startType) {

    if (startType === "countdown3") {
      for (let i = 3; i > 0; i--) {
        if (structureCueEnabled()) speakFallback(String(i));
        await sleep(400);
      }
    }

    if (startType === "silent") {
      await sleep(1200 + Math.random() * 1500);
    }
  }

  function tick() {
    if (!S.running) return;

    S.raf = requestAnimationFrame(tick);

    const now = performance.now();
    const dt = (now - S.lastTick) / 1000;
    S.lastTick = now;

    if (S.inRest) {
      S.restLeft -= dt;
      hardStopVisual();
     setStatus(`RECOVER • ${COMBAT.rank.toUpperCase()}`);

      if (clockEl) {
        clockEl.textContent = fmt(S.restLeft);
      }

      updateRoundLabel();

      if (!S.restReadyCalled && Math.ceil(S.restLeft) === 5) {
        S.restReadyCalled = true;
        sayRestReady();
      }

      if (S.restLeft <= 0) {
        S.inRest = false;
        S.round += 1;
        updateRoundPill();
        S.restReadyCalled = false;
        S.breatheCalled = false;
        r5Index = 0;
        r5CyclePos = 0;
        r5CycleKeys = [];
        r5Timer = 0;
        S.tLeft = COMBAT.roundSec;
        S.shortCalled = false;
        resetRound5();
        updateRoundLabel();

        sayRoundStart(S.round).then(() => {
          log(`Round ${S.round}: ${getRoundData(S.round).label}`);
        });
      }

      return;
    }

    const prevTLeft = S.tLeft;
S.tLeft -= dt;
    tempoTimer += dt;

const tempoInterval = getTempoInterval();

if (tempoTimer >= tempoInterval) {
  tempoTimer = 0;

  // only run in mute / structure mode (optional control later)
if (structureCueEnabled()) {
  whistle();

}
}

    if (S.shortCalled) {
      shortVisual();
    } else {
      goVisual();
    }

    setStatus("RUNNING");

    if (clockEl) {
      clockEl.textContent = fmt(S.tLeft);
    }

    updateRoundLabel();

if (!S.shortCalled && prevTLeft > 10 && S.tLeft <= 10) {
  S.shortCalled = true;
  sayShortTime();
}

    if (S.round === 5 && !S.inRest && S.tLeft > 10) {
      r5Timer += dt;

if (!r5Busy && r5Timer >= R5_INTERVAL) {
  r5Timer = 0;
  runRound5();
}
    }

    if (S.tLeft <= 0) {
      sayRoundEnd();

      if (S.round >= COMBAT.rounds) {
        log(`Finished: ${COMBAT.rank}`);
        stop();
        return;
      }

      S.inRest = true;
      S.restLeft = COMBAT.restSec;
      log(`Rest ${COMBAT.restSec}s • Boxer's Bounce`);
      sayRestStart();
    }
  }



  function stop() {
    S.running = false;
    S.paused = false;
    cancelAnimationFrame(S.raf);

    stopMusic();
    stopVoiceAudio();

    document.body.classList.remove("go", "short", "stop");
    setStatus("idle");

    S.inRest = false;
    S.restLeft = COMBAT.restSec;
    S.shortCalled = false;
    S.preRolling = false;
    resetRound5();
tempoTimer = 0;
    if (clockEl) clockEl.textContent = fmt(COMBAT.roundSec);
    updateRoundLabel();
    log("Stopped");
  }

  function reset() {
    stop();
    S.round = 1;
    updateRoundPill();
    S.tLeft = COMBAT.roundSec;
    S.inRest = false;
    S.restLeft = COMBAT.restSec;
    S.shortCalled = false;
    S.breatheCalled = false;
    resetRound5();
tempoTimer = 0;
    if (clockEl) clockEl.textContent = fmt(COMBAT.roundSec);
    updateRoundLabel();
    setStatus("idle");
    log("Reset");
  }
  function updateRoundPill() {
  if (!intervalClock) return;
  intervalClock.textContent = `${S.round} / ${COMBAT.rounds}`;
}

  // =========================
  // UI EVENTS
  // =========================
  if (gearBtn && settings) {
    gearBtn.onclick = () => {
      settings.hidden = false;
    };
  }

  if (closeSettings && settings) {
    closeSettings.onclick = () => {
      settings.hidden = true;
    };
  }

  if (settings) {
    settings.addEventListener("click", (e) => {
      if (e.target === settings) {
        settings.hidden = true;
      }
    });
  }

  if (defaultsBtn) {
    defaultsBtn.onclick = () => {
      if (voiceEl) voiceEl.value = "on";
      if (volumeEl) volumeEl.value = 0.9;
      if (musicToggleEl) musicToggleEl.checked = false;
      if (musicVolumeEl) musicVolumeEl.value = 0.6;
      if (musicSrcEl) musicSrcEl.value = "";
      if (colorMode) colorMode.checked = true;
      if (modeSelect) modeSelect.value = "coach";
      if (trainerModeEl) trainerModeEl.textContent = modeLabel(currentMode());
      stopMusic();
      log("Defaults restored.");
    };
  }

  if (stageToggle) {
    stageToggle.onclick = () => {
      document.body.classList.toggle("stage");
      stageToggle.textContent = document.body.classList.contains("stage")
        ? "Normal Clock"
        : "Big Clock";
    };
  }

  if (modeSelect) {
    modeSelect.onchange = () => {
      if (trainerModeEl) trainerModeEl.textContent = modeLabel(currentMode());

      stopMusic();

      if (S.running && musicEnabled()) {
        startMusic();
      }
    };
  }

if (startBtn) {
  startBtn.onclick = async () => {
    unlockSpeech();

    try {
      const synth = window.speechSynthesis;
      if (synth) {
        const u = new SpeechSynthesisUtterance("ready");
        u.volume = 0.01;
        synth.speak(u);
      }
    } catch (e) {}

    start();
  };
}
  if (stopBtn) stopBtn.onclick = stop;
  if (resetBtn) resetBtn.onclick = reset;
if ("speechSynthesis" in window) {
  window.speechSynthesis.onvoiceschanged = () => {};
}

document.addEventListener("click", unlockSpeech, { once: true });
document.addEventListener("touchstart", unlockSpeech, { once: true });
  // =========================
  // INIT
  // =========================
  function init() {
    document.body.classList.remove("theme-day");
    document.body.classList.add("theme-night");

    S.rounds = COMBAT.rounds;
    S.tLeft = COMBAT.roundSec;
    S.restLeft = COMBAT.restSec;

if (clockEl) clockEl.textContent = fmt(COMBAT.roundSec);

if (intervalPill) intervalPill.hidden = false;
updateRoundPill();

    setTrainerPanel();
    updateRoundLabel();
    setStatus("idle");
    showNextTip();
    hardStopVisual();
    log("Combat timer ready.");
  }
  init();
});
