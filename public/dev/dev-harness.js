// public/coaches/_dev/dev-harness.js
// DEV Harness — canonical test panel
// - Loads ONLY dev/test athletes (devMode===true && isTest===true)
// - Refuses to award to non-dev docs (hard guard)
// - Lets you browse real KIND keys and issue awards using the same awardXP pipe
// - Supports top-level "amount" (required for many server rules)

import { db, collection, getDocs, query, where } from "/assets/js/firebase-init.js";
import { ensureSignedIn } from "/assets/js/firebase-init.js";
import { awardXP, KIND } from "/assets/js/xp-api.js";

const $ = (id) => document.getElementById(id);

const modePill   = $("modePill");
const trackPill  = $("trackPill");
const countPill  = $("countPill");
const statusLine = $("statusLine");

const trackF8OnlyEl = $("trackF8Only");
const reloadBtn     = $("reloadBtn");

const searchEl       = $("search");
const athleteSelect  = $("athleteSelect");
const refreshSnapBtn = $("refreshSnapBtn");
const copyUidBtn     = $("copyUidBtn");
const snapOut        = $("snapOut");
const guardLine      = $("guardLine");

const amountEl     = $("amount");      // ✅ NEW
const kindFilterEl = $("kindFilter");
const showKindsBtn = $("showKindsBtn");
const kindsBox     = $("kindsBox");
const kindKeyEl    = $("kindKey");
const metaJsonEl   = $("metaJson");
const issueBtn     = $("issueBtn");

const btnF8Strength5 = $("btnF8Strength5");
const btnF8Honor5    = $("btnF8Honor5");
const btnResetMonth  = $("btnResetMonth");

const receiptOut = $("receiptOut");

let devRoster = []; // [{ id, ...data }]
let selected = null;

function setStatus(msg, ok = true) {
  if (!statusLine) return;
  statusLine.textContent = msg;
  statusLine.classList.toggle("ok", !!ok);
  statusLine.classList.toggle("warn", !ok);
}

function trackWanted() {
  return trackF8OnlyEl?.checked ? "F8" : "F4";
}

function trackBaseOf(docId, a = {}) {
  const tb = String(a.trackBase || "").trim().toUpperCase();
  if (tb === "F4" || tb === "F8") return tb;

  const id = String(docId || a.uid || "").toUpperCase();
  if (id.startsWith("F4_")) return "F4";
  if (id.startsWith("F8_")) return "F8";

  const t = String(a.track || a.trackCode || "").toLowerCase();
  if (t.includes("foundry4") || t.includes("f4")) return "F4";
  if (t.includes("foundry8") || t.includes("f8")) return "F8";

  return "UNKNOWN";
}

function isDevDoc(a) {
  return a?.devMode === true && a?.isTest === true;
}

function displayName(a) {
  return a.publicName || a.fullName || a.uid || a.id;
}

function matchesSearch(a, q) {
  if (!q) return true;
  const s = q.toLowerCase();
  const hay = `${a.id} ${a.uid || ""} ${a.publicName || ""} ${a.fullName || ""} ${a.mintTag || ""}`.toLowerCase();
  return hay.includes(s);
}

function prettyJson(obj) {
  try { return JSON.stringify(obj, null, 2); }
  catch { return String(obj); }
}

function parseMeta() {
  const raw = (metaJsonEl?.value || "").trim();
  if (!raw) return {};
  try {
    const j = JSON.parse(raw);
    if (j && typeof j === "object") return j;
    return {};
  } catch {
    throw new Error("Meta JSON is invalid.");
  }
}

function parseAmount() {
  const raw = (amountEl?.value || "").trim();
  if (!raw) return undefined; // ✅ allow kinds that don't need amount
  const n = Number(raw);
  if (!Number.isFinite(n)) throw new Error("Amount must be a number.");
  return n;
}

function resolveKindFromInput() {
  const raw = (kindKeyEl?.value || "").trim();
  if (!raw) throw new Error("Enter a KIND key or raw kind string.");

  // If they typed a KIND key, map it. Otherwise allow raw string.
  if (KIND && Object.prototype.hasOwnProperty.call(KIND, raw)) return KIND[raw];
  return raw;
}

function setReceipt(obj) {
  if (!receiptOut) return;
  receiptOut.value = prettyJson(obj);
}

function setSelectedById(id) {
  selected = devRoster.find(a => a.id === id) || null;

  const ok = !!selected && isDevDoc(selected);
  copyUidBtn.disabled = !ok;
  issueBtn.disabled   = !ok;
  btnResetMonth.disabled = !ok;

  const isF8 = ok && trackBaseOf(selected.id, selected) === "F8";
  btnF8Strength5.disabled = !isF8;
  btnF8Honor5.disabled    = !isF8;

  if (!selected) {
    snapOut.textContent = "—";
    guardLine.innerHTML = `Guard: <span class="warn">no athlete selected</span>`;
    return;
  }

  const snap = {
    id: selected.id,
    uid: selected.uid || selected.id,
    devMode: selected.devMode,
    isTest: selected.isTest,
    isDev: selected.isDev,
    trackBase: selected.trackBase || null,
    inferredTrack: trackBaseOf(selected.id, selected),
    tier: selected.tier || selected.tierName || selected.rankName || null,
    xp: selected.xp ?? 0,
    xpCap: selected.xpCap ?? null,
    stripeCount: selected.stripeCount ?? null,
    minted: selected.mintTag || selected.virtue || null,
    team: selected.team || null,
    cityState: selected.cityState || null,
    updatedAt: selected.updatedAt || null,
  };

  snapOut.textContent = prettyJson(snap);

  guardLine.innerHTML = ok
    ? `Guard: <span class="ok">DEV doc validated (devMode && isTest)</span>`
    : `Guard: <span class="warn">REFUSING: not a DEV doc</span>`;

  if (trackPill) trackPill.textContent = `Track: ${trackWanted()}`;
}

async function loadDevRoster() {
  setStatus("Loading DEV roster…");

  const col = collection(db, "athletes");
  const q = query(col, where("devMode", "==", true), where("isTest", "==", true));
  const snap = await getDocs(q);

  let list = snap.docs.map(d => ({ id: d.id, ...d.data() }));

  const wanted = trackWanted();
  list = list.filter(a => trackBaseOf(a.id, a) === wanted);

  const qText = (searchEl?.value || "").trim();
  if (qText) list = list.filter(a => matchesSearch(a, qText));

  list.sort((A, B) => String(displayName(A)).toLowerCase().localeCompare(String(displayName(B)).toLowerCase()));

  devRoster = list;

  if (countPill) countPill.textContent = `Athletes: ${devRoster.length}`;
  if (trackPill) trackPill.textContent = `Track: ${wanted}`;
  if (modePill) modePill.textContent = "Mode: DEV";

  athleteSelect.innerHTML =
    `<option value="">Select a DEV athlete…</option>` +
    devRoster.map(a => {
      const name = displayName(a);
      const xp = Number(a.xp ?? 0);
      const cap = Number(a.xpCap ?? 0) || 0;
      const tag = `${a.id} · ${name} · ${xp}/${cap || "?"}`;
      return `<option value="${a.id}">${tag}</option>`;
    }).join("");

  const currentId = selected?.id;
  if (currentId && devRoster.some(a => a.id === currentId)) {
    athleteSelect.value = currentId;
    setSelectedById(currentId);
  } else {
    selected = null;
    setSelectedById("");
  }

  setStatus(`Loaded ${devRoster.length} DEV athletes. (${wanted})`, true);
}

function renderKindList() {
  if (!kindsBox) return;
  const filter = (kindFilterEl?.value || "").trim().toLowerCase();

  const entries = Object.entries(KIND || {}).filter(([k, v]) => {
    if (!filter) return true;
    return k.toLowerCase().includes(filter) || String(v).toLowerCase().includes(filter);
  });

  if (!entries.length) {
    kindsBox.innerHTML = `<div class="muted">No KIND entries match.</div>`;
    return;
  }

  kindsBox.innerHTML = entries.map(([k, v]) => {
    return `
      <div class="kind-row">
        <div>
          <div class="kind-key">${k}</div>
          <div class="kind-val">${String(v)}</div>
        </div>
        <button class="btn" type="button" data-pick-kind="${k}">Use</button>
      </div>
    `;
  }).join("");

  kindsBox.querySelectorAll("[data-pick-kind]").forEach(btn => {
    btn.addEventListener("click", () => {
      const key = btn.getAttribute("data-pick-kind");
      kindKeyEl.value = key;
      setStatus(`Selected kind key: ${key}`, true);
    });
  });
}

async function refreshSelectedFromServer() {
  if (!selected) return;
  await loadDevRoster();
}

async function issueAward(kindOverride = null, metaExtra = {}) {
  if (!selected) throw new Error("Select a DEV athlete first.");
  if (!isDevDoc(selected)) throw new Error("Refusing: selected athlete is not DEV (devMode && isTest required).");

  const uid = selected.uid || selected.id;
  const kind = kindOverride || resolveKindFromInput();
  const amount = parseAmount(); // ✅ NEW top-level amount (optional)
  const meta = { source: "dev-harness", trackWanted: trackWanted(), ...parseMeta(), ...metaExtra };

  setStatus(`Issuing ${String(kind)} to ${uid}…`);
  setReceipt({ pending: true, uid, kind, amount, meta });

  // ✅ send amount (server expects this for DEV_SETXP and likely others)
  const res = await awardXP({ uid, kind, amount, meta });

  setReceipt(res);
  setStatus(`Done: ${uid} (${String(kind)})`, true);

  await refreshSelectedFromServer();
}

function pickFirstKindKeyContaining(tokens) {
  const keys = Object.keys(KIND || {});
  const upperTokens = tokens.map(t => String(t).toUpperCase());
  for (const k of keys) {
    const K = k.toUpperCase();
    if (upperTokens.every(t => K.includes(t))) return k;
  }
  return null;
}

async function quickF8Strength5() {
  const k =
    pickFirstKindKeyContaining(["STRENGTH", "5"]) ||
    pickFirstKindKeyContaining(["MERIT", "STRENGTH"]) ||
    pickFirstKindKeyContaining(["STRENGTH"]);
  if (!k) throw new Error("Could not find a KIND key for Strength in KIND. Use the KIND list and pick manually.");

  kindKeyEl.value = k;
  if (amountEl) amountEl.value = "5"; // ✅ make it idiot-proof
  await issueAward(KIND[k], { quick: "F8_STRENGTH_5" });
}

async function quickF8Honor5() {
  const k =
    pickFirstKindKeyContaining(["HONOR", "5"]) ||
    pickFirstKindKeyContaining(["MERIT", "HONOR"]) ||
    pickFirstKindKeyContaining(["HONOR"]);
  if (!k) throw new Error("Could not find a KIND key for Honor in KIND. Use the KIND list and pick manually.");

  kindKeyEl.value = k;
  if (amountEl) amountEl.value = "5"; // ✅ make it idiot-proof
  await issueAward(KIND[k], { quick: "F8_HONOR_5" });
}

async function devResetMonth() {
  const raw = "DEV/RESET_MONTH";
  if (amountEl) amountEl.value = "";
  await issueAward(raw, { devReset: true });
}

// -----------------------------
// Boot
// -----------------------------
await ensureSignedIn();

trackF8OnlyEl?.addEventListener("change", () => loadDevRoster());
reloadBtn?.addEventListener("click", () => loadDevRoster());
searchEl?.addEventListener("input", () => loadDevRoster());

athleteSelect?.addEventListener("change", () => {
  const id = athleteSelect.value;
  setSelectedById(id);
});

refreshSnapBtn?.addEventListener("click", () => refreshSelectedFromServer());

copyUidBtn?.addEventListener("click", async () => {
  if (!selected) return;
  const uid = selected.uid || selected.id;
  try {
    await navigator.clipboard.writeText(uid);
    setStatus(`Copied UID: ${uid}`, true);
  } catch {
    setStatus("Clipboard blocked. Copy manually from snapshot.", false);
  }
});

showKindsBtn?.addEventListener("click", () => renderKindList());
kindFilterEl?.addEventListener("input", () => renderKindList());

issueBtn?.addEventListener("click", async () => {
  try { await issueAward(); }
  catch (e) {
    setStatus(e?.message || "Issue failed", false);
    setReceipt({ error: String(e?.message || e) });
  }
});

btnF8Strength5?.addEventListener("click", async () => {
  try { await quickF8Strength5(); }
  catch (e) {
    setStatus(e?.message || "Strength test failed", false);
    setReceipt({ error: String(e?.message || e) });
  }
});

btnF8Honor5?.addEventListener("click", async () => {
  try { await quickF8Honor5(); }
  catch (e) {
    setStatus(e?.message || "Honor test failed", false);
    setReceipt({ error: String(e?.message || e) });
  }
});

btnResetMonth?.addEventListener("click", async () => {
  try { await devResetMonth(); }
  catch (e) {
    setStatus(e?.message || "Reset failed (likely not implemented server-side)", false);
    setReceipt({
      error: String(e?.message || e),
      note: "Implement server support for kind DEV/RESET_MONTH restricted to devMode && isTest.",
    });
  }
});

// initial render
renderKindList();
await loadDevRoster();
setStatus("Ready.", true);
