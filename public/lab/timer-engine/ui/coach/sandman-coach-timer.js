(function () {
  function boot() {
    const Engine = window.SandmanTimerEngine;
    if (!Engine) {
      setTimeout(boot, 50);
      return;
    }

    const conceptEl = document.getElementById("concept");
    const presetEl = document.getElementById("preset");
    const promptsEl = document.getElementById("prompts");
    const clockEl = document.getElementById("clock");
    const statusEl = document.getElementById("status");
    const pillWrap = document.getElementById("intervalPill");
    const pillClock = document.getElementById("intervalClock");
    const startBtn = document.getElementById("startBtn");
    const pauseBtn = document.getElementById("pauseBtn");
    const resetBtn = document.getElementById("resetBtn");
    const roundsEl = document.getElementById("roundsInput");
    const restEl = document.getElementById("restInput");
    const logEl = document.getElementById("log");

    const trainerTrackEl = document.getElementById("trainerTrack");
    const trainerTierEl = document.getElementById("trainerTier");
    const trainerModeEl = document.getElementById("trainerMode");
    const trainerSequenceEl = document.getElementById("trainerSequence");

    const settings = document.getElementById("settings");
    const gearBtn = document.getElementById("gearBtn");
    const closeSettings = document.getElementById("closeSettings");
    const colorMode = document.getElementById("colorMode");
    const audioMode = document.getElementById("audioMode");
    const countdownMode = document.getElementById("countdownMode");
    const voiceEl = document.getElementById("voiceToggle");
    const volumeEl = document.getElementById("volume");
    const defaultsBtn = document.getElementById("defaultsBtn");
    const stageToggle = document.getElementById("stageToggle");
    const themeToggle = document.getElementById("themeToggle");

    Engine.attachUI({
      conceptEl,
      presetEl,
      promptsEl,
      clockEl,
      statusEl,
      pillWrap,
      pillClock,
      roundsEl,
      restEl,
      logEl,
      trainerTrackEl,
      trainerTierEl,
      trainerModeEl,
      trainerSequenceEl,
      colorMode,
      audioMode,
      countdownMode,
      voiceEl,
      volumeEl,
    });

    if (startBtn) startBtn.onclick = Engine.start;
    if (pauseBtn) pauseBtn.onclick = Engine.pause;
    if (resetBtn) resetBtn.onclick = Engine.stop;

    if (gearBtn && settings) {
      gearBtn.onclick = () => {
        settings.style.display = "block";
      };
    }

    if (closeSettings && settings) {
      closeSettings.onclick = () => {
        settings.style.display = "none";
      };
    }

    if (defaultsBtn) {
      defaultsBtn.onclick = () => {
        if (colorMode) colorMode.checked = false;
        if (audioMode) audioMode.value = "voiceWhistle";
        if (countdownMode) countdownMode.value = "standard";
        if (voiceEl) voiceEl.value = "on";
        if (volumeEl) volumeEl.value = 0.9;
      };
    }

    if (stageToggle) {
      stageToggle.onclick = () => {
        document.body.classList.toggle("stage");
        stageToggle.textContent = document.body.classList.contains("stage")
          ? "Normal clock"
          : "Big clock";
      };
    }

    if (themeToggle) {
      themeToggle.onclick = () => {
        document.body.classList.toggle("theme-day");
        const isDay = document.body.classList.contains("theme-day");
        themeToggle.textContent = isDay ? "Night mode" : "Day mode";
      };
    }

    if (conceptEl) {
      conceptEl.addEventListener("change", () => {
        Engine.loadPresets();
        Engine.loadSelection();
      });
    }

    if (presetEl) {
      presetEl.addEventListener("change", Engine.loadSelection);
    }

    if ("wakeLock" in navigator) {
      navigator.wakeLock.request("screen").catch(() => {});
    }


Engine.loadConcepts();
Engine.applyTrainerParams();
Engine.loadPresets();
Engine.loadSelection();
Engine.setTrainerPanel();
    if ("serviceWorker" in navigator) {
      window.addEventListener("load", () => {
        navigator.serviceWorker.register("/sw.js").catch(() => {});
      });
    }
  }

  boot();
})();