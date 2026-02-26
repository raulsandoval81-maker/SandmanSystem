// public/dev/dev-actions.js
// Ladder stress test using REAL callable rules:
// - Full Grind = kind ATTENDANCE + amount 10
// - Half Grind = kind ATTENDANCE + amount 5
// NO Arena, NO negative decay (not supported by backend yet)

import { httpsCallable } from "firebase/functions";
import { functions } from "/assets/js/firebase-init.js";

const incrementXp = httpsCallable(functions, "incrementXp");

const $ = (id) => document.getElementById(id);

function nowISO() {
  return new Date().toISOString();
}

function writeOut(obj) {
  const out = $("out");
  if (!out) return;
  out.textContent = JSON.stringify(obj, null, 2);
}

function line(msg) {
  const log = $("log");
  if (!log) return;
  log.textContent += `[${nowISO()}] ${msg}\n`;
  log.scrollTop = log.scrollHeight;
}

function setRunning(on) {
  const run = $("btnRun");
  const stop = $("btnStop");
  if (run) run.disabled = on;
  if (stop) stop.disabled = !on;
}

async function fireGrind(uid, amount, label) {
  const payload = {
    uid,
    kind: "DEV/GRIND",
    amount,
    note: label,
  };

  const res = await incrementXp(payload);
  const data = res?.data || {};

  // Pretty, coach-readable log
  if (data.blocked) {
    line(`BLOCKED (${label}) → reason=${data.reason} | xp=${data.afterXp}/${data.cap} | tier=${data.tier} base=${data.base}`);
  } else {
    line(`OK (+${data.amount} ${label}) → xp=${data.afterXp}/${data.cap} | stripes=${data.stripeCount} step=${data.stripeStep} | tier=${data.tier} base=${data.base}`);
  }

  writeOut(data);
  return data;
}

// Public API used by the buttons
export async function fullGrind(uid) {
  return fireGrind(uid, 10, "Full Grind");
}

export async function halfGrind(uid) {
  return fireGrind(uid, 5, "Half Grind");
}

// One-button ladder stress test:
// runs a pattern until blocked or until it hits safety limit
export async function runLadderStress(uid, opts = {}) {
  const steps = Number.isFinite(opts.steps) ? opts.steps : 200; // safety
  const delayMs = Number.isFinite(opts.delayMs) ? opts.delayMs : 120;

  // pattern = [10,5,10,5...] (your old school test rhythm)
  const pattern = Array.isArray(opts.pattern) && opts.pattern.length
    ? opts.pattern
    : [10, 5, 10, 5];

  let i = 0;
  for (; i < steps; i++) {
    if (window.__STOP_STRESS_TEST__) break;

    const amt = pattern[i % pattern.length];
    const label = (amt === 10) ? "Full Grind" : "Half Grind";

    const data = await fireGrind(uid, amt, label);

    // Stop conditions:
    // - Monthly cap reached
    // - Tier cap reached
    // - Any other block
    if (data.blocked) {
      line(`STOP: blocked reason=${data.reason}`);
      return { ok: true, stopped: true, reason: data.reason, last: data, ran: i + 1 };
    }

    // small pause so you can watch logs/UI without hammering
    await new Promise(r => setTimeout(r, delayMs));
  }

  if (window.__STOP_STRESS_TEST__) {
    line("STOP: manual stop pressed");
    return { ok: true, stopped: true, reason: "MANUAL_STOP", ran: i };
  }

  line(`STOP: safety limit reached (${steps} steps)`);
  return { ok: true, stopped: true, reason: "SAFETY_LIMIT", ran: i };
}

// Wire UI if present
function bind() {
  const uidEl = $("uid");
  const runEl = $("btnRun");
  const stopEl = $("btnStop");
  const fullEl = $("btnFull");
  const halfEl = $("btnHalf");
  const clearEl = $("btnClear");

  if (stopEl) stopEl.disabled = true;

  if (clearEl) {
    clearEl.addEventListener("click", () => {
      window.__STOP_STRESS_TEST__ = false;
      if ($("log")) $("log").textContent = "";
      writeOut({});
      line("Cleared.");
    });
  }

  if (fullEl) {
    fullEl.addEventListener("click", async () => {
      const uid = (uidEl?.value || "").trim();
      if (!uid) return line("Missing uid.");
      try { await fullGrind(uid); } catch (e) { line(`ERROR: ${e?.message || e}`); }
    });
  }

  if (halfEl) {
    halfEl.addEventListener("click", async () => {
      const uid = (uidEl?.value || "").trim();
      if (!uid) return line("Missing uid.");
      try { await halfGrind(uid); } catch (e) { line(`ERROR: ${e?.message || e}`); }
    });
  }

  if (runEl) {
    runEl.addEventListener("click", async () => {
      const uid = (uidEl?.value || "").trim();
      if (!uid) return line("Missing uid.");

      window.__STOP_STRESS_TEST__ = false;
      setRunning(true);
      line("RUN: ladder stress test started (pattern 10/5/10/5)");

      try {
        const result = await runLadderStress(uid, { steps: 300, delayMs: 120, pattern: [10,5,10,5] });
        writeOut(result);
      } catch (e) {
        line(`ERROR: ${e?.message || e}`);
      } finally {
        setRunning(false);
      }
    });
  }

  if (stopEl) {
    stopEl.addEventListener("click", () => {
      window.__STOP_STRESS_TEST__ = true;
      line("Stop requested…");
    });
  }
}

bind();
