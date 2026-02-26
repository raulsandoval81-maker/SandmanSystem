// /public/dev/dev-actions.js
// ===============================
// DEV Ladder Stress Tool (Coach)
// Uses /assets/js/xp-api.js as the single gateway.
// ===============================

import { renderLiteXpBar } from "/assets/js/xp-bar-lite.js";
import { getStripeInfo } from "/assets/js/ladder.service.js";
import { awardXP } from "/assets/js/xp-api.js";

const $ = (id) => document.getElementById(id);

function getDevModeFromUrl() {
  const p = new URLSearchParams(window.location.search);
  return p.get("dev") === "1";
}

function nowISO() {
  return new Date().toISOString().slice(11, 19); // HH:MM:SS
}

function writeOut(obj) {
  const out = $("out");
  if (!out) return;
  out.textContent = JSON.stringify(obj || {}, null, 2);
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

function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n));
}

// ===== Live bar paint (combat stripe view only) =====
function paintCombatBarFromServer(data) {
  const holder = $("bar");
  if (!holder) return;

  const xp = Number(data?.afterXp ?? data?.xp ?? 0);
  const cap = Number(data?.cap ?? data?.xpCap ?? 1200);

  let earned = Number(data?.stripeCount ?? NaN);
  let total = 4;

  if (!Number.isFinite(earned)) {
    try {
      const info = getStripeInfo("f4", xp);
      earned = Number(info?.stripesEarned ?? 0);
      total = Number(info?.stripesTotal ?? 4);
    } catch {
      earned = 0;
      total = 4;
    }
  }

  holder.innerHTML = "";
  renderLiteXpBar({
    container: holder,
    xp,
    cap,
    stripesTotal: total,
    stripesEarned: earned,
    stripeTone: "black",
  });

  const pct = clamp(Math.round((xp / (cap || 1200)) * 100), 0, 100);
  const sub = document.createElement("div");
  sub.className = "muted";
  sub.style.marginTop = "6px";
  sub.style.fontSize = ".8rem";
  sub.textContent = `XP ${xp}/${cap} • Stripes ${earned}/${total} • ${pct}%`;
  holder.appendChild(sub);
}

// ===== Shared runner through xp-api gateway =====
async function fireXp(uid, kind, amount, label, meta = undefined) {
  const devMode = getDevModeFromUrl();

  // NOTE: xp-api requires amount 10 or 5 for non-arena kinds.
  // DEV kinds should omit amount completely, but this page only uses DEV/PROMOTE_TIER (no amount).
  const payload = {
    uid,
    kind,
    note: label,
    ...(meta ? { meta } : {}),
    // harmless extra flag if you want it; backend can ignore
    dev: devMode,
  };

  // Only attach amount for non-DEV kinds
  if (!String(kind).startsWith("DEV/")) payload.amount = amount;

  let data = {};
  try {
    data = await awardXP(payload);
  } catch (e) {
    line(`ERROR calling awardXP: ${e?.message || e}`);
    writeOut({ ok: false, error: String(e?.message || e) });
    throw e;
  }

  const blocked = !!data?.blocked;
  const reason = data?.reason || "—";
  const cap = data?.cap ?? "—";
  const tier = data?.tier ?? "—";
  const stripes = data?.stripeCount ?? "—";

  // what did we actually change?
  const afterCombat = data?.afterXp ?? "—";
  const afterStrength = data?.xpStrength ?? "—";
  const afterHonor = data?.xpHonor ?? "—";

  if (blocked) {
    line(`BLOCKED (${label}) reason=${reason} | cap=${cap} | tier=${tier}`);
  } else {
    if (kind === "STRENGTH") {
      line(`OK (+${data?.amount ?? amount} ${label}) → Strength ${afterStrength}/${cap} | tier=${tier}`);
    } else if (kind === "HONOR") {
      line(`OK (+${data?.amount ?? amount} ${label}) → Honor ${afterHonor}/${cap} | tier=${tier}`);
    } else if (kind.startsWith("DEV/")) {
      line(`OK (${label})`);
    } else {
      line(`OK (+${data?.amount ?? amount} ${label}) → XP ${afterCombat}/${cap} | tier=${tier} | stripes ${stripes}/4`);
    }
  }

  writeOut(data);

  // Paint combat bar only on combat changes (keeps this page honest)
  if (kind === "ATTENDANCE") paintCombatBarFromServer(data);

  return data;
}

// ===== Public API =====
export async function fullGrind(uid)  { return fireXp(uid, "ATTENDANCE", 10, "Full Grind"); }
export async function halfGrind(uid)  { return fireXp(uid, "ATTENDANCE", 5,  "Half Grind"); }
export async function str10(uid)      { return fireXp(uid, "STRENGTH",   10, "Strength +10"); }
export async function str5(uid)       { return fireXp(uid, "STRENGTH",   5,  "Strength +5"); }
export async function hon10(uid)      { return fireXp(uid, "HONOR",      10, "Honor +10"); }
export async function hon5(uid)       { return fireXp(uid, "HONOR",      5,  "Honor +5"); }

// Promote tier via DEV kind inside incrementXp
export async function promoteTier(uid){
  // DEV kinds must omit amount; our fireXp handles that.
  return fireXp(uid, "DEV/PROMOTE_TIER", undefined, "Dev promotion");
}

// One-button ladder stress test (combat attendance 10/5 rhythm)
export async function runLadderStress(uid, opts = {}) {
  const steps = Number.isFinite(opts.steps) ? opts.steps : 240;
  const delayMs = Number.isFinite(opts.delayMs) ? opts.delayMs : 120;
  const pattern = Array.isArray(opts.pattern) && opts.pattern.length ? opts.pattern : [10, 5, 10, 5];

  for (let i = 0; i < steps; i++) {
    if (window.__STOP_STRESS_TEST__) break;

    const amt = pattern[i % pattern.length];
    const label = amt === 10 ? "Full Grind" : "Half Grind";

    const data = await fireXp(uid, "ATTENDANCE", amt, label);

    if (data?.blocked) {
      line(`STOP: blocked (${data.reason || "—"}) after ${i + 1} steps`);
      return { ok: true, stopped: true, reason: data.reason, last: data, ran: i + 1 };
    }

    await new Promise((r) => setTimeout(r, delayMs));
  }

  if (window.__STOP_STRESS_TEST__) {
    line("STOP: manual stop pressed");
    return { ok: true, stopped: true, reason: "MANUAL_STOP" };
  }

  line("STOP: safety limit reached");
  return { ok: true, stopped: true, reason: "SAFETY_LIMIT" };
}

// ===== UI wiring =====
function bind() {
  const uidEl = $("uid");
  const readUid = () => (uidEl?.value || "").trim();

  const runEl = $("btnRun");
  const stopEl = $("btnStop");
  const fullEl = $("btnFull");
  const halfEl = $("btnHalf");
  const clearEl = $("btnClear");

  const str10El = $("btnStr10");
  const str5El  = $("btnStr5");
  const hon10El = $("btnHon10");
  const hon5El  = $("btnHon5");

  const promoteEl = $("btnPromoteDev");

  if (stopEl) stopEl.disabled = true;

  if (clearEl) {
    clearEl.addEventListener("click", () => {
      window.__STOP_STRESS_TEST__ = false;
      const log = $("log"); if (log) log.textContent = "";
      writeOut({});
      const bar = $("bar"); if (bar) bar.innerHTML = "";
      line("Cleared.");
    });
  }

  if (fullEl) fullEl.addEventListener("click", async () => {
    const uid = readUid(); if (!uid) return line("Missing uid.");
    try { await fullGrind(uid); } catch {}
  });

  if (halfEl) halfEl.addEventListener("click", async () => {
    const uid = readUid(); if (!uid) return line("Missing uid.");
    try { await halfGrind(uid); } catch {}
  });

  if (str10El) str10El.addEventListener("click", async () => {
    const uid = readUid(); if (!uid) return line("Missing uid.");
    try { await str10(uid); } catch {}
  });

  if (str5El) str5El.addEventListener("click", async () => {
    const uid = readUid(); if (!uid) return line("Missing uid.");
    try { await str5(uid); } catch {}
  });

  if (hon10El) hon10El.addEventListener("click", async () => {
    const uid = readUid(); if (!uid) return line("Missing uid.");
    try { await hon10(uid); } catch {}
  });

  if (hon5El) hon5El.addEventListener("click", async () => {
    const uid = readUid(); if (!uid) return line("Missing uid.");
    try { await hon5(uid); } catch {}
  });

  if (promoteEl) promoteEl.addEventListener("click", async () => {
    const uid = readUid(); if (!uid) return line("Missing uid.");
    try { await promoteTier(uid); } catch {}
  });

  if (runEl) runEl.addEventListener("click", async () => {
    const uid = readUid(); if (!uid) return line("Missing uid.");

    window.__STOP_STRESS_TEST__ = false;
    setRunning(true);
    line("RUN: stress test started (ATTENDANCE) pattern 10/5/10/5");

    try {
      const result = await runLadderStress(uid, { steps: 300, delayMs: 120, pattern: [10, 5, 10, 5] });
      writeOut(result);
    } catch (e) {
      line(`ERROR: ${e?.message || e}`);
    } finally {
      setRunning(false);
    }
  });

  if (stopEl) stopEl.addEventListener("click", () => {
    window.__STOP_STRESS_TEST__ = true;
    line("Stop requested…");
  });
}

export function initLadderStress() { bind(); }
initLadderStress();
