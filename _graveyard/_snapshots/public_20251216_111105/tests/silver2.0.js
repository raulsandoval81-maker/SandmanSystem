// public/silver.js — Sandman Silver (Firestore + Stripes/Cooldown)
// -----------------------------------------------------------------

// ============== Firebase (CDN ESM) ==============
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.1/firebase-app.js";
import {
  getFirestore, connectFirestoreEmulator,
  doc, setDoc, getDoc, updateDoc, collection, addDoc,
  query, where, orderBy, limit, getDocs, serverTimestamp,
  onSnapshot                           // <-- add this
} from "/vendor/firebase/10.13.1/firebase-firestore.js";

// (optional) expose helpers to DevTools console while developing
Object.assign(window, { doc, setDoc, getDoc, updateDoc, addDoc, collection, getDocs, query, where, orderBy, limit });

// --- YOUR CONFIG ---
const firebaseConfig = {
  apiKey: "demo",
  authDomain: "demo.firebaseapp.com",
  projectId: "sandman-silver-dev",
  storageBucket: "demo.appspot.com",
  messagingSenderId: "000000000000",
  appId: "1:000000000000:web:xxxx"
};

const app = initializeApp(firebaseConfig);
const db  = getFirestore(app);
window.db = db;

if (location.hostname === "localhost" || location.hostname === "127.0.0.1") {
  connectFirestoreEmulator(db, "127.0.0.1", 8081);
  console.log("Firestore emulator connected :8081");
}
// ========================= FIREBASE IMPORTS =========================
// import {...} from "/vendor/firebase/...";

// ========================= GLOBAL HELPERS =========================
function getVal(id){ return document.getElementById(id)?.value || ""; }
const setText = (id, v) => {

  const el = typeof id === "string" ? document.getElementById(id) : id;
  if (el) el.textContent = v;
};
function digitsOnly(s) {
  return String(s || "").replace(/\D/g, "");
}
// ========================= VIRTUE MAPS =========================

// Master virtue map
const virtueNameByCode = {
  // F8 Warrior set
  TN: "Tenacity",
  CR: "Courage",
  PT: "Patience",
  DS: "Discipline",
  BR: "Bravery",
  GR: "Grit",
  RS: "Resilience",
  ST: "Strength",
  // F4 Core set
  HN: "Honor",
  IN: "Integrity",
  LD: "Leadership",
  WS: "Wisdom",
  LO: "Loyalty",
  TR: "Trust",
  SC: "Sacrifice",
  PR: "Pride"
};

// Explicit code order lists
const F8_CODES = ["TN","CR","PT","DS","BR","GR","RS","ST"];
const F4_CODES = ["HN","IN","LD","WS","LO","TR","SC","PR"];

// Track codes -> human labels
const TRACK_LABELS = {
  F8_Combat: "Foundry 8 Combat",
  F4_Combat: "Foundry 4 Combat",
  F4_Leadership: "Foundry 4 Leadership",
};

// base “family” if you still need legacy F4/F8
const baseFromTrackCode = (code="") => code.startsWith("F8") ? "F8" : "F4";

// normalize anything like "F8" or "F8_Combat" to a trackCode we store/paint
const normalizeTrackCode = (t="") =>
  t.startsWith("F8") ? (t.includes("_") ? t : "F8_Combat")
                     : (t.includes("_") ? t : "F4_Combat");


// ========================= FUNCTIONS =========================
async function paintWhenReady(uid) {

  // Realtime: paint the first time the doc exists
  let painted = false;
  const ref = doc(db, "athletes", uid);

  const unsub = onSnapshot(ref, (snap) => {
    if (snap.exists()) {
      const a = snap.data();
      bindAthleteView(a);
      painted = true;
      console.log("[athlete] snapshot painted:", uid);
      try { unsub(); } catch {}
    }
  }, (err) => {
    console.error("[athlete] snapshot error:", err);
  });

  // Fallback: short retry with getDoc in case snapshot is delayed
  const tries = 8;             // ~1.6s total
  const waitMs = 200;
  for (let i = 0; i < tries && !painted; i++) {
    await new Promise(r => setTimeout(r, waitMs));
    try {
      const s = await getDoc(ref);
      if (s.exists()) {
      bindAthleteView({ uid, ...s.data() });
        painted = true;
        console.log("[athlete] fallback getDoc painted:", uid);
        break;
      }
    } catch (e) {
      console.warn("[athlete] fallback getDoc error:", e);
    }
  }

  if (!painted) {
    console.warn("[athlete] still blank after approve; check rules/paths/uid:", uid);
    // Surface something visible so it’s not just blank
    const statusEl = document.getElementById("ath-status");
    if (statusEl) statusEl.textContent = "Awaiting profile… (check console)";
  }
}

// ============== Tiny DOM helpers ==============
const $ = (id) => document.getElementById(id);
const setValue    = (id, v) => { const el = $(id); if (el) el.value = v; };
const setDisabled = (id, v) => { const el = $(id); if (el) el.disabled = v; };
const addClass    = (id, c) => { const el = $(id); if (el) el.classList.add(c); };
const removeClass = (id, c) => { const el = $(id); if (el) el.classList.remove(c); };
const hm  = (v) => String(v ?? "").trim();
const two = (n) => String(n).padStart(2, "0");
const fmtDate = (ts) => !ts ? "—" : `${new Date(ts).getFullYear()}-${two(new Date(ts).getMonth()+1)}-${two(new Date(ts).getDate())}`;
const fillIfBlank = (id, v) => {const el = document.getElementById(id);if (el && !el.value) el.value = v ?? "";};


// ---------- Virtue UID (centralized) ----------
const VIRTUE_CODES_F8 = ["TN","CR","PT","DS","BR","GR","RS","ST"];
const VIRTUE_CODES_F4 = ["HN","IN","LD","WS","LO","TR","SC","PR"];
const UID_REGEX = /^F[48]-(?:TN|CR|PT|DS|BR|GR|RS|ST|HN|IN|LD|WS|LO|TR|SC|PR)\d{5}$/;
// ======================================================
// Normalize phones (strip formatting and validate)

function normalizeTrack(t){ return (t||"").startsWith("F8") ? "F8" : "F4"; }
function pad5(n){ return String(n).padStart(5,"0"); }
function deckForTrack(t){ return normalizeTrack(t)==="F8" ? VIRTUE_CODES_F8 : VIRTUE_CODES_F4; }
function normalizePhone(s){ return (s || "").replace(/[^\d]/g, ""); }  // keep digits
function isValidUSPhone(s){ return normalizePhone(s).length === 10; }   // simple US rule

// ===== Invite token (Sandman-Way-000001) helpers =====
const INVITE_SLUG = "Sandman-Way";       // display prefix
const INVITE_PAD  = 6;                   // digits: 6 -> 000001

function fmtSerial(n, pad = INVITE_PAD){
  return String(n).padStart(pad, "0");
}

// naive Firestore counter (fine for emulator / single admin use)
async function nextInviteSerial() {
  const ref = doc(db, "counters", "inviteSerial");
  const snap = await getDoc(ref);
  const current = snap.exists() ? (snap.data().value || 0) : 0;
  const next = current + 1;
  await setDoc(ref, { value: next, updatedAt: serverTimestamp() }, { merge: true });
  return next; // 1,2,3,…
}

// --- Coach lock (keeps Coach tab open briefly after Approve)
window.__stayOnCoach = false;
window.__coachLockUntil = 0;

function coachLockActive() {
  return window.__stayOnCoach && Date.now() < window.__coachLockUntil;
}

// optional helper
function setCoachLock(ms = 8000) {
  window.__stayOnCoach = true;
  window.__coachLockUntil = Date.now() + ms;
}

// existing per-track counters: you already have mintCounterKey()/nextCounter(); reuse them

function mintUid(track){
  const base  = normalizeTrack(track);
  const codes = deckForTrack(base);
  const code  = codes[0];                 // deterministic first code; you can randomize if you prefer
  const seq   = nextCounter(mintCounterKey(base));
  return `${base}-${code}${pad5(seq)}`;
}

function paintCoachLastApproved(a){
  const box = $("coach-last-approved"); if (!box) return;
  const cs = [a.city, a.state].filter(Boolean).join(", ");
  const pub = a.publicName || ((a.first||"")[0] ? `${(a.first||"")[0]}. ${a.last||""}`.trim() : (a.last||a.first||"—"));
  setText("coach-last-public",    pub || "—");
  setText("coach-last-uid",       a.uid || "—");
  setText("coach-last-track",     a.track || a.trackCode || "—");
  setText("coach-last-tierrank", `${a.tier||"T0"} / ${a.rank||"—"}`);
  setText("coach-last-team",      a.team || "—");
  setText("coach-last-citystate", cs || "—");
  setText("coach-last-padlock",   a.padlock || "—");
  box.style.display = "block";
}

// --- Phone helpers ---

function wirePhoneSanitizers() {
  ["pi-parent-phone","pi-emer-phone"].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener("input", () => {
      // strip non-digits and cap at 10 while typing
      const cleaned = digitsOnly(el.value).slice(0, 10);
      el.value = cleaned;
    });
  });
}

// Global state
// ---- Coach lists ----
let approvedLimit = 8;   // default = show last 8

let currentIntakeId = null;   // <-- move this near the top

// --- tolerant setters (support old/new ids) ---
function setTextAny(ids, v){
  ids.forEach(id => { const el = document.getElementById(id); if (el) el.textContent = v; });
}
function setWidthAny(ids, pct){
  ids.forEach(id => { const el = document.getElementById(id); if (el) el.style.width = pct; });
}

function clearCoachPanelAfterApprove() {
  // inputs the coach sees
  setValue("pub-initial", "");
  setValue("pub-last", "");
  setValue("team-name", "");
  setValue("team-city", "");
  setValue("team-state", "");
  setValue("minted-uid", "");              // if that input still exists
  setValue("invite-link", "");             // tidy the invite row
  setText("invite-status", "");

  // confirm row
  setText("out-uid", "—");
  setText("out-track", "—");
  setText("out-tier", "—");
  setText("out-team", "—");
  setText("out-location", "—");
  setText("out-padlock", "—");
  setText("approve-status", "Ready.");

  // forget last loaded intake id (prevents re-closing the same one)
  try { currentIntakeId = null; } catch {}
}

// ============== XP / Stripes constants ==============
const XP_PER_STRIPE = 200;
const STRIPES_MAX   = 4;
const XP_CAP        = XP_PER_STRIPE * STRIPES_MAX; // 800
const COOLDOWN_DAYS_DEFAULT = 14;


// === XP CONFIG (tracks, caps, ranks) ===
// HS Pilot: F4 T0=1200, T1=1400; F8 T0=600. Stripes = cap/4 per tier.
const XP_CONFIG = {
  F8: {
    caps:  { T0: 600, T1: 800, T2: 1000, T3: 1200, T4: 1400, T5: 1600, T6: 1800, T7: 2000, T8: 2400 },
    ranks: { T0:"Shadow", T1:"Recruit", T2:"Combatant", T3:"Competitor", T4:"Warrior", T5:"Champion", T6:"Commander", T7:"Sandman", T8:"Hero" }
  },
  F4: {
    caps:  { T0: 1200, T1: 1400, T2: 1800, T3: 2200, T4: 2400 },
    ranks: { T0:"Apprentice", T1:"Warrior", T2:"Champion", T3:"Veteran", T4:"Legend" }
  }
};

// Copy full invite link to clipboard
$("btn-copy-token")?.addEventListener("click", async () => {
  const el = $("invite-link");
  const text = el?.value?.trim();
  if (!text) { setText("invite-status", "Nothing to copy yet."); return; }

  try {
    // Works on HTTPS and localhost
    await navigator.clipboard.writeText(text);
    setText("invite-status", "Copied link.");
  } catch {
    // Fallback for older browsers
    try {
      el.select();
      document.execCommand?.("copy");
      setText("invite-status", "Copied link.");
    } catch (e) {
      console.error("copy error:", e);
      setText("invite-status", "Couldn’t copy (see console).");
    }
  }
});

// --- Helper getters (used by paint + XP updates) ---
function getCap(a){
  const caps = XP_CONFIG[a.track]?.caps || {};
  return caps[a.tier] ?? (a?.xpCap ?? XP_CAP); // fallback to doc xpCap or global XP_CAP
}

function getRank(a){
  return a.rank || XP_CONFIG[a.track]?.ranks?.[a.tier] || (a.track === "F8" ? "Shadow" : "Apprentice");
}

// 4 stripes = “ready to test” for every tier (rounded to nice tens)
function getStripeStep(a){
  const cap = getCap(a);
  return Math.max(1, Math.round(cap / 4 / 10) * 10);
}


// --- Tier helpers (use XP_CONFIG to walk tiers) ---
function tierNumber(tier) {
  const n = parseInt(String(tier || 'T0').replace(/\D/g,''), 10);
  return Number.isFinite(n) ? n : 0;
}
function sortedTiersFor(track) {
  const caps = XP_CONFIG[track]?.caps || {};
  return Object.keys(caps).sort((a,b) => tierNumber(a) - tierNumber(b));
}
function nextTierOf(track, tier) {
  const tiers = sortedTiersFor(track);
  const cur   = tierNumber(tier);
  const idx   = tiers.findIndex(t => tierNumber(t) === cur);
  if (idx < 0) return 'T0';
  return tiers[Math.min(idx + 1, tiers.length - 1)];
}
function isTopTier(track, tier) {
  const tiers = sortedTiersFor(track);
  return tiers.length ? tiers[tiers.length - 1] === (tier || 'T0') : true;
}

// ============== Tier/Rank helpers ==============
const defaultRankFor = (uid) => (uid.startsWith("F8") ? "Shadow" : "Apprentice");
const tierRankLabel  = (tier, rank) => `${tier} / ${rank}`;

// ============== Mint helpers ==============
const mintCounterKey = (track) => (track === "F8" ? "uidCounterF8" : "uidCounterF4");
const nextCounter = (key) => {
  const n = (parseInt(localStorage.getItem(key) || "0", 10) + 1);
  localStorage.setItem(key, String(n));
  return n;
};

function mintPadlock() {
  const n = (parseInt(localStorage.getItem("padlockCounter") || "0", 10) + 1);
  localStorage.setItem("padlockCounter", String(n));
  return String(n).padStart(6, "0");
}

async function adminLogs(patch){
  try{
    await addDoc(collection(db, "adminLogs"), {
      ts: serverTimestamp(),
      actor: "ui",
      ...patch
    });
  }catch(e){ console.warn("[adminLogs] warn:", e); }
}

// ======================================================================
//                           INVITES (Coach)
// ======================================================================
function urlWithInvite(tok) {
  const u = new URL(location.href);
  u.searchParams.set("invite", tok);
  return u.toString();
}

$("btn-make-token")?.addEventListener("click", async () => {
 try {
    const tok = crypto.randomUUID();                 // secure id in URL
    const exp = Date.now() + 48 * 3600 * 1000;       // 48 hours

    // Save invite doc
    await setDoc(doc(db, "invites", tok), {
      exp,
      createdAt: Date.now()
    });

    // Log (optional)
    await adminLogs({ scope: "invite", action: "create", token: tok, exp });

    // Update UI
    setValue("invite-link", urlWithInvite(tok));     // full copyable link
    setText("invite-status",
      `Token created. Expires ${new Date(exp).toLocaleString()} (48h).`);

    console.log(`Invite → ${urlWithInvite(tok)}`);
  } catch (e) {
    console.error("make-token error:", e);
    setText("invite-status", "Error creating token (see console).");
  }
});

console.log("[approve] click");
console.table({
  currentIntakeId,
  mintedUid: document.getElementById("minted-uid")?.value || "",
  pubInitial: document.getElementById("pub-initial")?.value || "",
  pubLast: document.getElementById("pub-last")?.value || "",
});

// Read token for Parent/Athlete panels (also shows validity if present)
async function setTokenBadgeFromURL() {
  try {
    const u = new URL(location.href);
    const tok = u.searchParams.get("invite");
    if (!tok) return null;

    setText("token-view", tok);

    const snap = await getDoc(doc(db, "invites", tok));
    if (!snap.exists()) { setText("token-exp", "Token not found (dev)."); return tok; }
    const exp = snap.data()?.exp || 0;
    setText("token-exp", exp > Date.now()
      ? `Valid until ${new Date(exp).toLocaleString()}`
      : "Expired");
    return tok;
  } catch (e) {
    console.error("badgeFromURL error:", e);
    return null;
  }
}

// ======================================================
// WAIVER (Parent)
// ======================================================
// ======================================================
// WAIVER (Parent)
// ======================================================
const WAIVER_URL = "/waiver/sandman-waiver-v3.pdf"; // update if your filename differs
let waiverViewed = false;

function markWaiverViewed() {
  waiverViewed = true;
  removeClass("waiver-seen", "warn");
  addClass("waiver-seen", "ok");
  setText("waiver-seen", "Viewed");
  setDisabled("pi-waiver", false);
  setDisabled("pi-sign", false);
  setDisabled("pi-sign-date", false);
  maybeUnlockSubmit();
}

$("btn-open-waiver")?.addEventListener("click", (e) => {
  e.preventDefault();
  // open in new tab; we treat the click as “viewed”
  window.open(WAIVER_URL, "_blank", "noopener");
  markWaiverViewed();
});

function maybeUnlockSubmit() {
  const ok =
    waiverViewed &&
    (!!$("pi-waiver")?.checked) &&
    String($("pi-sign")?.value || "").trim() &&
    String($("pi-sign-date")?.value || "").trim();

  setDisabled("btn-pi-submit", !ok);
}

// re-check as user interacts
["pi-waiver","pi-sign","pi-sign-date"].forEach(id => {
  const el = document.getElementById(id);
  if (!el) return;
  ["input","change"].forEach(evt => el.addEventListener(evt, maybeUnlockSubmit));
});
// ======================================================
// TOKEN VALIDATION
// ======================================================
async function requireValidInviteToken(){
  const u = new URL(location.href);
  const tok = u.searchParams.get("invite");
  if (!tok) throw new Error("Missing invite token.");

  const snap = await getDoc(doc(db,"invites",tok));
  if (!snap.exists()) throw new Error("Invalid invite token.");

  const exp = snap.data()?.exp || 0;
  if (exp <= Date.now()) throw new Error("Invite token expired.");

  return { token: tok, exp };
}

// ======================================================
// PARENT SUBMIT
// ======================================================
// Normalize phones (strip formatting) and validate

// one helper near the top

// ======================================================
// Validate and format parent + emergency phone numbers

// ======================================================================
//                   INTAKE: SUBMIT HANDLER (Parent Side)
// ======================================================================


// Validate and pretty-format phones, return true/false
function validateAndFormatPhones() {
  const parentPhoneEl = document.getElementById("pi-parent-phone");
  const emerPhoneEl   = document.getElementById("pi-emer-phone");

  const parentPhone = digitsOnly(parentPhoneEl?.value).slice(0, 10);
  const emerPhone   = digitsOnly(emerPhoneEl?.value).slice(0, 10);

  const fmt = n => n.length === 10 ? `(${n.slice(0,3)}) ${n.slice(3,6)}-${n.slice(6)}` : n;
  if (parentPhoneEl) parentPhoneEl.value = fmt(parentPhone);
  if (emerPhoneEl)   emerPhoneEl.value   = fmt(emerPhone);

  if (parentPhone.length !== 10) { setText("pi-status", "Enter a valid 10-digit parent phone."); parentPhoneEl?.focus(); return false; }
  if (emerPhone.length !== 10)   { setText("pi-status", "Enter a valid 10-digit emergency phone."); emerPhoneEl?.focus();   return false; }
  return true;
}

// Token check
async function getValidInviteToken() {
  try {
    const tok = new URL(location.href).searchParams.get("invite");
    if (!tok)              return { ok:false, reason:"Missing invite token in URL." };
    const snap = await getDoc(doc(db, "invites", tok));
    if (!snap.exists())    return { ok:false, reason:"Invite token not found." };
    const exp = snap.data()?.exp || 0;
    if (Date.now() > exp)  return { ok:false, reason:"Invite token expired." };
    return { ok:true, token: tok, exp };
  } catch (e) {
    return { ok:false, reason:"Token check failed.", error:e };
  }
}

const isMeaningful = s => !!String(s || "").trim();

// ---- Main handler (single copy) ----
async function handleSubmitIntake(e) {
  e.preventDefault();
  const btn = $("btn-pi-submit");
  btn?.setAttribute("disabled","disabled");
  setText("pi-status","Submitting…");

  // 1) Phone validation/formatting
  if (!validateAndFormatPhones()) { btn?.removeAttribute("disabled"); return; }

  // 2) Waiver + date
  if (!$("pi-waiver")?.checked) { setText("pi-status","You must agree to the waiver."); btn?.removeAttribute("disabled"); return; }
  if (!$("pi-sign-date")?.value){ setText("pi-status","Add signature date.");         btn?.removeAttribute("disabled"); return; }

  // 3) Require Allergies/Injuries text (allow "None")
  const medField = $("pi-med");
  const medText  = String(medField?.value || "");
  if (!isMeaningful(medText)) {
    setText("pi-status","Please list allergies/injuries (or type “None”).");
    medField?.focus();
    btn?.removeAttribute("disabled");
    return;
  }

  // 4) Token check
  const t = await getValidInviteToken();
  if (!t.ok) {
    console.warn("[submit] token error:", t);
    setText("pi-status", `Cannot submit: ${t.reason || "No invite in URL."}`);
    setText("token-exp","Tip: Click 'Generate Token' in Coach, then open that link here.");
    btn?.removeAttribute("disabled");
    return;
  }

  // 5) Collect fields
  const stateRaw = String($("pi-state")?.value || "");
  const parentPhonePretty = String($("pi-parent-phone")?.value || "");
  const emerPhonePretty   = String($("pi-emer-phone")?.value || "");

  const intake = {
    token: t.token,
    first: String($("pi-first")?.value || "").trim(),
    last:  String($("pi-last") ?.value || "").trim(),
    dob:   String($("pi-dob")  ?.value || "").trim(),
    team:  String($("pi-team") ?.value || "").trim(),
    city:  String($("pi-city") ?.value || "").trim(),
    state: stateRaw.toUpperCase(),

    parentEmail: String($("pi-parent-email")?.value || "").trim(),
    parentPhone: parentPhonePretty,
    parentPhoneRaw: digitsOnly(parentPhonePretty),
    emerName:    String($("pi-emer-name") ?.value || "").trim(),
    emerPhone:   emerPhonePretty,
    emerPhoneRaw: digitsOnly(emerPhonePretty),
    med:         medText.trim(),   // Allergies/Injuries

    waiver:   !!$("pi-waiver")?.checked,
    sign:     String($("pi-sign")?.value || "").trim(),
    signDate: String($("pi-sign-date")?.value || "").trim(),

    status: "submitted",
    createdAt: serverTimestamp(),
  };

  if (!intake.first) { setText("pi-status","Add athlete first name."); btn?.removeAttribute("disabled"); return; }

  // 6) Write + log
  try {
    await setDoc(doc(db, "intakes", t.token), intake);
    try {
      await addDoc(collection(db, "adminLogs"), {
        scope:"intake", action:"submit", token:t.token,
        athleteFirst:intake.first, athleteLast:intake.last, ts: serverTimestamp(),
      });
    } catch (logErr) { console.warn("adminLogs (submit) warn:", logErr); }

    setText("pi-status","Submitted. Waiting for Coach Approval.");
    console.log(`[submit] OK token=${t.token} ${intake.first} ${intake.last}`);
  } catch (e2) {
    console.error("[submit] write error:", e2);
    setText("pi-status", `Error submitting intake: ${e2?.message || e2}`);
  } finally {
    btn?.removeAttribute("disabled");
  }
}

// ---- Wire listener (single copy only) ----
$("btn-pi-submit")?.addEventListener("click", handleSubmitIntake);
// ======================================================================
//                 COACH: PENDING & RECENT APPROVALS
// ======================================================================


// --- Toggle 8 ↔ 30 for approvals list ---
document.getElementById("btn-toggle-approved")?.addEventListener("click", () => {
  approvedLimit = (approvedLimit === 8 ? 30 : 8);
  const b = document.getElementById("btn-toggle-approved");
  if (b) b.textContent = (approvedLimit === 8 ? "Show Last 30" : "Show Last 8");
  refreshApproved();
});

// --- Open Athlete Profile button (stay on coach if you want; this flips) ---
document.getElementById("btn-open-athlete")?.addEventListener("click", () => {
  // if you’re using the coach-lock, disable it here:
  window.__stayOnCoach = false;
  showTab?.("athlete");
});

// --- Recent Approvals (from intakes: status == 'approved') ---
async function refreshApproved() {
  try {
    const qs = await getDocs(
      query(
        collection(db, "intakes"),
        where("status", "==", "approved"),
        orderBy("approvedAt", "desc"),
        limit(approvedLimit)
      )
    );

    const box = document.getElementById("approved-list");
    if (!box) return;

    box.innerHTML = "";
    if (qs.empty) {
      box.classList.add("muted");
      box.textContent = "No approvals yet.";
      return;
    }

    box.classList.remove("muted");
    const rows = [];
    qs.forEach(d => {
      const a = d.data() || {};
      const when = a.approvedAt?.toDate ? a.approvedAt.toDate().toLocaleString() : "";
      const name = a.publicName || `${a.first||""} ${a.last||""}`.trim() || a.approvedUid || a.uid || "—";
      const loc  = [a.city, a.state && String(a.state).toUpperCase()].filter(Boolean).join(", ");
      rows.push(
        `<div>${when} — <strong>${name}</strong> • ${a.track || a.trackCode || ""} • ${a.tier || ""} / ${a.rank || ""} • ${loc} • ${a.approvedUid || a.uid || ""}</div>`
      );
    });
    box.innerHTML = rows.join("");
  } catch (e) {
    console.warn("[refreshApproved] error:", e);
    setText("approved-list", "Error loading approvals (see console).");
  }
}

// --- Pending Intakes (status == 'submitted') ---
async function refreshPending() {
  try {
    const qs = await getDocs(
      query(
        collection(db, "intakes"),
        where("status", "==", "submitted"),
        orderBy("createdAt", "desc"),
        limit(12)
      )
    );

    const list = [];
    qs.forEach((d) => list.push({ id: d.id, ...d.data() }));
    setText("pending-count", list.length ? `${list.length} pending` : "—");

    const box = document.getElementById("pending-list");
    if (!box) return;

    if (!list.length) {
      box.classList.add("muted");
      box.textContent = "No pending intakes yet.";
      return;
    }

    box.classList.remove("muted");
    box.innerHTML = "";
    list.forEach((it) => {
      const when = it.createdAt?.toDate
        ? it.createdAt.toDate().toLocaleString()
        : (it.createdAt ? new Date(it.createdAt).toLocaleString() : "");
      const loc  = [it.city, it.state && String(it.state).toUpperCase()].filter(Boolean).join(", ");
      const div  = document.createElement("div");
      div.innerHTML = `
        ${when} —
        <strong>${it.first ?? ""} ${it.last ?? ""}</strong>
        • ${loc}
        <button class="outline-blue small" data-load="${it.id}">Load</button>`;
      box.appendChild(div);
    });

    // Delegate clicks for dynamic Load buttons
    box.onclick = async (e) => {
      const btn = e.target.closest("button[data-load]");
      if (!btn) return;
      await loadIntake(btn.getAttribute("data-load"));
    };
  } catch (e) {
    console.error("[refreshPending] error:", e);
    setText("pending-list", "Error loading list (see console).");
  }
}

// --- Manual refresh of pending list ---
document.getElementById("btn-find-intakes")?.addEventListener("click", (e) => {
  e.preventDefault();
  refreshPending();
});

// --- Load approvals on startup ---
document.addEventListener("DOMContentLoaded", () => {
  refreshApproved();
});
async function loadIntake(id) {
  const snap = await getDoc(doc(db, "intakes", id));
  if (!snap.exists()) { setText("pending-list", "Not found."); return; }
  const it = snap.data();

  // Identity (public) — auto-fill from parent intake
fillIfBlank("pub-initial", (it.first?.[0] || "").toUpperCase() + ".");
fillIfBlank("pub-last",    it.last || "");

// Team / location (coach-side Identity row)
fillIfBlank("team-name",  it.team  || "Sandman");
fillIfBlank("team-city",  it.city  || "");
fillIfBlank("team-state", it.state || "");

// Optional: show the location pill immediately
const loc = (it.city && it.state) ? `${it.city}, ${String(it.state).toUpperCase()}`
                                  : (it.city || (it.state ? String(it.state).toUpperCase() : "—"));
setText("out-location", loc);
setText("out-team", it.team || "Sandman");
setText("out-city",  it.city  || "—");
setText("out-state", String(it.state || "").toUpperCase() || "—");

  // ✅ so Approve knows which intake to close
  currentIntakeId = id;
  console.log("[loadIntake] Loaded", id, it);

  // fill the coach inputs / preview
  setValue("pub-initial", (it.first?.[0] || "").toUpperCase() + ".");
  setValue("pub-last", it.last || "");
  setValue("team-name", it.team || getVal("team-name")?.value || "Sandman Combat");
  setValue("team-city", it.city || "");
  setValue("team-state", it.state || "");
  setText("approve-status", `Loaded ${it.first} ${it.last}.`);
}

// ======================================================================
//                              MINT (UID)
// ======================================================================
document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("mint-f8")?.addEventListener("click", () => doMint("F8_Combat"));
  document.getElementById("mint-f4")?.addEventListener("click", () => doMint("F4_Combat"));
  document.getElementById("mint-f4-lead")?.addEventListener("click", () => doMint("F4_Leadership"));
});

function doMint(trackCode) {
  // normalize the base track (so you always get F8_ or F4_)
  const base = normalizeTrack(trackCode);

  // program defaults
  const tier = base.startsWith("F8") ? "T0" : "T0";
  const rank = base.startsWith("F8") ? "Shadow" : "Apprentice";

  // build UID
  const uid = mintUid(base);

  // lock into hidden final fields
  setValue("final-track", base);
  setValue("final-tier", tier);
  setValue("final-rank", rank);
  setValue("final-uid", uid);
  setValue("minted-uid", uid);

const team = (getVal("team-name") || getVal("coach-team") || getVal("pi-team") || "");
const city = getVal("team-city") || getVal("pi-city") || "";
const state = getVal("team-state") || getVal("pi-state") || "";
const teamLocation = (city && state) ? `${city}, ${state.toUpperCase()}`
                                     : (city || (state ? state.toUpperCase() : "") || "--");
const trackLabel = TRACK_LABELS[trackCode] || TRACK_LABELS[base] || trackCode;

  // coach-visible preview
  setText("out-uid", uid);
  setText("out-track", trackLabel);
  setText("out-tier", `${tier} / ${rank}`);
  setText("out-team", team);
  setText("out-location", teamLocation);
  setText("out-city",      city);               // ✅ add
  setText("out-state",     state.toUpperCase()); // ✅ add
  setText("out-padlock", "—");         // set for real during Approve
  setText("approve-status", `Minted — ${uid}`);
}


// ========================= COACH: APPROVE / ACTIVATE =========================
const _approveBtn = document.getElementById("btn-approve");
console.log("[wire] approve button found:", !!_approveBtn);

document.getElementById("btn-approve")?.addEventListener("click", async () => {
  try {
    setText("approve-status", "Approving...");

    // 0) Read core inputs FIRST (so they are in scope everywhere below)
    let trackCode  = normalizeTrackCode(getVal("final-track") || "F4_Combat");
    const finalTier = (getVal("final-tier") || "T0").trim();
    const finalRank = (getVal("final-rank") || (trackCode.startsWith("F8") ? "Shadow" : "Apprentice")).trim();
    const track     = baseFromTrackCode(trackCode); // "F4" or "F8"

    // 1) Resolve UID EARLY and HOISTED
    let uid = (getVal("final-uid") || "").trim();
    if (!UID_REGEX.test(uid)) {
      uid = mintUid(track);
      setValue("final-uid", uid);
    }
function scopePanels(tab) {
  document.querySelectorAll("[data-scope]").forEach(el=>{
    el.classList.toggle("scope-hide", el.dataset.scope !== tab);
  });
}
// call whenever the tab changes:
window.showTab = (tab) => {
  // ...your existing tab switch code...
  scopePanels(tab);
};
// initial:
document.addEventListener("DOMContentLoaded", ()=> scopePanels("coach"));

// keep coach panel visible a bit
setCoachLock(8000);
showTab('coach');
document.getElementById('coach-approve-body')
  ?.scrollIntoView({ behavior: 'smooth', block: 'start' });

// tidy + refresh lists
clearCoachPanelAfterApprove?.();
currentIntakeId = null;
await refreshPending?.();
await refreshApproved?.();


    // 2) Team / location (used in multiple places)
    const team  = (getVal("team-name")  || getVal("coach-team") || getVal("pi-team")  || "—").trim();
    const city  = (getVal("team-city")  || getVal("pi-city")    || "").trim();
    const state = (getVal("team-state") || getVal("pi-state")   || "").trim();
    const teamLocation = (city && state) ? `${city}, ${state.toUpperCase()}`
                                         : (city || (state ? state.toUpperCase() : "") || "--");

    // 3) Padlock
    const padlock = String(Date.now()).slice(-6).split("").reverse().join("");

    // 4) Save athlete (UPSERT) — use human track label and seed cap from config
    const humanTrack = TRACK_LABELS?.[trackCode] || TRACK_LABELS?.[track] || trackCode;
    const seededCap  = XP_CONFIG[track]?.caps?.[finalTier] ?? XP_CAP;

    // Name resolution (from intake if needed)
    const token = new URL(location.href).searchParams.get("invite") || "";
    let intakeFirst = "", intakeLast = "";
    if (token) {
      try {
        const s = await getDoc(doc(db, "intakes", token));
        if (s.exists()) { const d = s.data() || {}; intakeFirst = (d.first||"").trim(); intakeLast = (d.last||"").trim(); }
      } catch {}
    }
    const title = s => (s || "").replace(/\b\w+/g, w => w[0].toUpperCase() + w.slice(1).toLowerCase());
    const f = title(getVal("final-first") || getVal("pi-first") || intakeFirst);
    const l = title(getVal("final-last")  || getVal("pi-last")  || intakeLast);
    let publicName = (getVal("pi-nick") || "").trim();
    if (!publicName) publicName = (f && l) ? `${f[0]}. ${l}` : (l || f || "—");

    const virtueCode = (uid.split("-")[1] || "").slice(0,2);
    const virtueName = virtueNameByCode?.[virtueCode] || null;

    await setDoc(doc(db, "athletes", uid), {
      uid,
      first: f, last: l,
      privateName: `${f} ${l}`.trim(),
      publicName,
      track: humanTrack,          // friendly label
      trackCode,                  // keep code too
      team, city, state: state.toUpperCase(),
      tier: finalTier, rank: finalRank,
      padlock, virtueCode, virtueName,
      xp: 0,
      xpCap: seededCap,           // seed tier cap
      stripeCount: 0,
      cooldownUntil: null,
      status: "Active (Rostered)",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    }, { merge: true });


    // 5) Close intake ROW (now safe to reference uid)
    try {
      const tokenInUrl = new URL(location.href).searchParams.get("invite") || "";
      const idToClose  = currentIntakeId || tokenInUrl;
      console.log("[approve] currentIntakeId =", currentIntakeId);
      if (idToClose) {
        await updateDoc(doc(db, "intakes", idToClose), {
          status: "approved",
          approvedUid: uid,
          approvedAt: serverTimestamp(),
        });
        console.log("[approve] intake closed:", idToClose);

       // 👇 insert here
paintCoachLastApproved({
  uid,
  track: humanTrack,
  trackCode,
  tier: finalTier,
  rank: finalRank,
  team, city, state: state.toUpperCase(),
  padlock,
  first: f, last: l, publicName
});
refreshApproved(); 
      } else {
        console.warn("[approve] no intake id/token; list item will remain until next load.");
      }
    } catch (e) {
      console.warn("[approve] could not close intake:", e);
    }

    // 6) Log
    await addDoc(collection(db, "adminLogs"), {
      scope: "approve", action: "activate",
      uid, track, tier: finalTier, rank: finalRank,
      team, city, state: state.toUpperCase(),
      padlock, token,
      virtueCode, virtueName,
      ts: serverTimestamp(), actor: "coach-ui-local"
    });

    // 7) UI feedback
    setText("out-uid", uid);
    setText("out-track", humanTrack);
    setText("out-tier", `${finalTier} / ${finalRank}`);
    setText("out-team", team);
    setText("out-location", teamLocation);
    setText("out-padlock", padlock);
    setText("approve-status", `Approved ${publicName} (${uid}) · Padlock ${padlock} seized.`);
    try { localStorage.setItem("lastApprovedUid", uid); } catch {}

    await paintWhenReady?.(uid);

    // 8) Cleanup
    clearCoachPanelAfterApprove?.();
    currentIntakeId = null;
    refreshPending?.();

  } catch (err) {
    console.error("approve error:", err);
    setText("approve-status", `Approve error: ${err?.message || err}`);
  }
});

// --- Coach lock (keeps Coach tab open briefly after Approve) ---
// --- Coach lock (defined once near the top) ---
if (typeof window.coachLockActive !== 'function') {
  window.__stayOnCoach = false;
  window.__coachLockUntil = 0;
  window.coachLockActive = () =>
    window.__stayOnCoach && Date.now() < window.__coachLockUntil;
  window.setCoachLock = (ms=8000) => {
    window.__stayOnCoach = true;
    window.__coachLockUntil = Date.now() + ms;
    setTimeout(() => { window.__stayOnCoach = false; }, ms + 100);
  };
}

// --- top-level helper (NOT nested) ---
function openAndPaintActiveAthlete(){
  // if coach is locked, don't auto-paint/flip to athlete
  if (typeof coachLockActive === 'function' && coachLockActive()) return;

  const uid = localStorage.getItem("lastApprovedUid");
  if (!uid) return;

  // ensure accordion is open
  const p = document.querySelector('main[data-panel="athlete"]');
  if (p) {
    const hdr = p.querySelector('.section-hdr');
    const body = p.querySelector('.section-body');
    if (hdr && !hdr.classList.contains('open')) hdr.classList.add('open');
    if (body) { body.style.maxHeight = "2000px"; body.style.padding = "12px"; }
  }

  // your existing painter
  if (typeof paintWhenReady === "function") paintWhenReady(uid);
}

// --- tabs ---
function showTab(name){
  // respect the coach lock if present
  if (typeof coachLockActive === "function" && coachLockActive() && name !== "coach") {
    name = "coach";
  }

  tabs.forEach(t => t.classList.toggle('active', t.dataset.tab === name));
  panels.forEach(p => {
    const on = p.getAttribute('data-panel') === name;
    p.hidden = !on;
    const firstHdr = p.querySelector('.section-hdr');
    if (on && firstHdr && !firstHdr.classList.contains('open')) firstHdr.click();

    if (on && name === "athlete") {
      const body = p.querySelector('.section-body');
      const hdr  = p.querySelector('.section-hdr');
      if (hdr && !hdr.classList.contains('open')) hdr.classList.add('open');
      if (body) { body.style.maxHeight = "2000px"; body.style.padding = "12px"; }
      openAndPaintActiveAthlete();
    }
  });

  const u = new URL(location.href);
  u.hash = name;
  history.replaceState(null, '', u);
}

// closes click handler
// ======================================================================
//                   ATHLETE VIEW + XP / TEST ACTIONS
// ======================================================================
// XP helpers
const stripesFromXp = (xp) => Math.min(STRIPES_MAX, Math.floor((xp ?? 0) / XP_PER_STRIPE));
const pct = (xp, cap = XP_CAP) => Math.max(0, Math.min(100, Math.round(((xp ?? 0) / (cap ?? XP_CAP)) * 100)));

// --- Belt colors (final) ---
const BELT_COLORS = {
  F4: ['#ffffff','#2563eb','#7c3aed','#8b4513','#111827'], // T0..T4
  F8: ['#ffffff','#facc15','#b14e07ff','#10b981','#2563eb','#7c3aed','#8b4513','rgba(243, 243, 8, 1)','#111827'], // T0..T8
};

function tierIndex(t) {
  const n = parseInt(String(t || '0').replace(/\D/g, ''), 10);
  return Number.isFinite(n) ? n : 0;
}
function beltColorFor(track, tier){
  const arr = BELT_COLORS[track] || BELT_COLORS.F4;
  return arr[Math.min(arr.length - 1, Math.max(0, tierIndex(tier)))];
}
function stripeToneFor(beltHex){
  return (beltHex?.toLowerCase() === '#ffffff') ? 'black' : 'white'; // black stripes on white belt
}
function renderStripeBoxes(stripeCount, track, tier){
  const boxes = document.querySelectorAll('.stripe-boxes .stripe-box');
  if (!boxes.length) return;

  const belt = beltColorFor(track, tier);
  const tone = (belt.toLowerCase() === '#ffffff') ? 'black' : 'white';

  // set belt color on both layers
  const bright = document.getElementById('ath-meter');
  const dim    = document.getElementById('belt-dim');
  if (bright) bright.style.setProperty('--belt-color', belt);
  if (dim)    dim.style.setProperty('--belt-color', belt);

  boxes.forEach((el,i)=>{
    el.classList.remove('white','black','filled');
    el.classList.add(tone);
    if (i < stripeCount) el.classList.add('filled');
  });
}

function updateAthUI(a) {
  // rank from config (fallback)
  const tier = a.tier || "T0";
  const rank = a.rank || (a.track === "F8" ? "Shadow" : "Apprentice");

  // normalize track + paint friendly label
  const trackCode = (a.trackCode || a.track || "").trim();
  const normCode  = normalizeTrackCode(trackCode);
  const trackLabel = TRACK_LABELS[normCode] || normCode || "—";
  setTextAny(["ath-track"], trackLabel);

  // top fields (write to old/new ids)
  setTextAny(["ath-name"], `${a.first ?? ""} ${a.last ?? ""}`.trim() || "—");
  setTextAny(["ath-public","ath-name-public"], a.publicName || "—");
  setTextAny(["ath-uid"], a.uid || "—");
  setTextAny(["ath-tierrank"], `${tier} · ${rank}`);
  setTextAny(["ath-team"], a.team || "—");
  setTextAny(["ath-status"], a.status || "Active (Rostered)");
  setText("ath-citystate", `${a.city || ""}${a.state ? ", " + a.state : ""}`);

  // XP + meter (cap + stripes driven by config)
  const cap   = Math.max(1, getCap(a));
  const step  = Math.max(1, getStripeStep(a));
  const xp    = a.xp ?? 0;
  const pctVal = Math.max(0, Math.min(100, Math.round((xp / cap) * 100)));

  setTextAny(["ath-xp","ath-xp-val"], xp);
  setTextAny(["ath-cap","ath-xp-cap"], cap);

  const bar = document.getElementById("ath-meter");
  if (bar) bar.style.width = `${pctVal}%`;
  setWidthAny(["ath-xp-bar"], `${pctVal}%`);

  // stripes (cap/4 per tier) — use base family for color logic
  const stripes = a.stripeCount ?? Math.min(STRIPES_MAX, Math.floor(xp / step));
  setTextAny(["ath-stripes"], `${stripes} / ${STRIPES_MAX}`);
  renderStripeBoxes(stripes, baseFromTrackCode(normCode), a.tier);

  // cooldown
  const inCooldown = !!(a.cooldownUntil && Date.now() < a.cooldownUntil);
  const cooldownText = inCooldown ? `On cooldown until ${fmtDate(a.cooldownUntil)}.` : "";
  setTextAny(["xp-msg","ath-xp-msg"], cooldownText);
  setTextAny(["ath-cooldown"], a.cooldownUntil ? fmtDate(a.cooldownUntil) : "—");

  // buttons + test section visibility
  const atCap = xp >= cap;
  ["btn-xp-10","btn-xp-5"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.disabled = atCap || inCooldown;
  });

  const ta = document.getElementById("test-actions");
  if (ta) ta.style.display = atCap ? "flex" : "none";
}

let athleteCache = null;
function bindAthleteView(a) { athleteCache = { ...a }; updateAthUI(athleteCache); }

async function loadAthlete(uid) {
  const snap = await getDoc(doc(db, "athletes", uid));
  if (!snap.exists()) return null;
  const a = snap.data();
  bindAthleteView(a);
  return a;
}

async function applyXp(delta) {
  if (!athleteCache?.uid) return;
  if (athleteCache.cooldownUntil && Date.now() < athleteCache.cooldownUntil) {
    setText("xp-msg", `On cooldown until ${fmtDate(athleteCache.cooldownUntil)}.`);
    return;
  }

  const cap   = getCap(athleteCache);
  const step  = getStripeStep(athleteCache);
  const before = athleteCache.xp ?? 0;
  const after  = Math.max(0, Math.min(cap, before + delta));

  const patch = {
    xp: after,
    stripeCount: Math.min(STRIPES_MAX, Math.floor(after / step))
  };

  if (after >= cap) patch.status = "At Cap — Testing";

  await updateDoc(doc(db, "athletes", athleteCache.uid), patch);

  athleteCache = { ...athleteCache, ...patch };
  updateAthUI(athleteCache);
  setText("xp-msg", `XP ${delta > 0 ? "+" : ""}${delta} applied → ${after}/${cap}.`);
}

async function markTestPass() {
  if (!athleteCache?.uid) return;

  // ✅ derive base track code ("F4" or "F8") from track/trackCode
  const base = baseFromTrackCode(athleteCache.trackCode || athleteCache.track || "F4");
  const cur  = athleteCache.tier || "T0";

  // ✅ use base for tier logic
  const atTop = isTopTier(base, cur);
  const next  = atTop ? cur : nextTierOf(base, cur);

  const newTier = next;
  const newRank = getRank({ track: base, tier: newTier });


  // pull the correct cap for the NEW tier
  const newCap = XP_CONFIG[base]?.caps?.[newTier] ?? XP_CAP;


  const patch = {
    tier: newTier,
    rank: newRank,
    xp: 0,
    stripeCount: 0,
    xpCap: newCap,  // ← update stored cap
    status: atTop ? `Top Tier ${newTier} — Maintained` : "Active (Rostered)",
    cooldownUntil: null,
    updatedAt: Date.now()
  };

  await updateDoc(doc(db, "athletes", athleteCache.uid), patch);

  athleteCache = { ...athleteCache, ...patch };
  updateAthUI(athleteCache);

  try {
    await addDoc(collection(db, "adminLogs"), {
      scope: "test",
      action: "pass",
      uid: athleteCache.uid,
      fromTier: cur,
      toTier: newTier,
      by: "coach-ui-local",
      ts: serverTimestamp()
    });
  } catch {}

  setText("test-msg",
    atTop
      ? `Already at top tier ${newTier} (${newRank}). XP reset to 0; continue excellence.`
      : `PASS → ${newTier} (${newRank}). XP reset; climb continues.`
  );
}

async function markTestReset(days = COOLDOWN_DAYS_DEFAULT) {
  if (!athleteCache?.uid) return;
  const until = Date.now() + days * 24 * 3600 * 1000;
  const patch = { xp: 0, stripeCount: 0, status: `Cooldown (${days}d)`, cooldownUntil: until };
  await updateDoc(doc(db, "athletes", athleteCache.uid), patch);
  athleteCache = { ...athleteCache, ...patch };
  updateAthUI(athleteCache);
  setText("test-msg", `Reset. Cooldown until ${fmtDate(until)}.`);
}

// Wire athlete actions
$("btn-xp-10")?.addEventListener("click", () => applyXp(10));
$("btn-xp-5") ?.addEventListener("click", () => applyXp(5));
$("btn-test-pass") ?.addEventListener("click", () => markTestPass());
$("btn-test-reset")?.addEventListener("click", () => markTestReset());

// --- DevTools bridge (so you can call funcs from the console) ---
Object.assign(window, {
  loadIntake,
  loadAthlete,   // ← add this
  applyXp,
  markTestPass,
  markTestReset,
  updateAthUI
});

async function showAthleteTabAndLoad(uid) {
  // switch to Athlete tab
  document.querySelector('.tab[data-tab="athlete"]')?.click();
  const panelAth = document.querySelector('main[data-panel="athlete"]');
  panelAth?.removeAttribute('hidden');

  // open the accordion if needed
  const hdr = panelAth?.querySelector('.section-hdr');
  if (hdr && !hdr.classList.contains('open')) hdr.click();

  // read back the just-written athlete doc
  const snap = await getDoc(doc(db, 'athletes', uid));
  if (!snap.exists()) {
    setText('test-msg', 'No athlete doc found (emulator?).');
    console.warn('[approve] athlete doc missing for', uid);
    return null;
  }

  const a = snap.data();
  if (typeof bindAthleteView === 'function') {
    bindAthleteView(a);         // sets cache + paints UI
  } else if (typeof updateAthUI === 'function') {
    updateAthUI(a);             // direct paint
  }
  setText('test-msg', `Loaded athlete: ${a.publicName || ((a.first||'')+' '+(a.last||'')).trim() || uid}`);
  console.log('✅ Athlete view loaded:', uid);
  return a;
}

Object.assign(window, { db, doc, getDoc, loadAthlete, updateAthUI });
// expose helpers globally so you can test in DevTools
Object.assign(window, { getCap, getStripeStep, getRank });


// ======================================================================
//                               INIT
// ======================================================================
document.addEventListener('DOMContentLoaded', async () => {
  // Badge / status from ?invite= param
  await setTokenBadgeFromURL();

  // Auto-load list if coach tab is open
  if (location.hash.includes('coach')) refreshPending();
setCoachLock(8000);  // locks Coach panel for 8 seconds
showTab('coach');    // re-focus Coach panel  

  // Auto-switch to Parent panel if invite token is in URL
  autoSwitchToParentIfInvite();
});

document.addEventListener("DOMContentLoaded", () => {
  wirePhoneSanitizers();
  // ...your other init...
});

// ======================================================================
//                      EXTRA: QR / Academy Button
// ======================================================================
document.getElementById('btn-open-qr')?.addEventListener('click', async () => {
  // Uses the last generated token in the input if present; otherwise creates one quickly
  let tok;
  const v = $('invite-link')?.value || '';
  const m = v.match(/[?&]invite=([a-f0-9-]+)/i);
  if (m) {
    tok = m[1];
  } else {
    tok = crypto.randomUUID();
    const exp = Date.now() + 48 * 3600 * 1000;
    await setDoc(doc(db, 'invites', tok), { exp, createdAt: Date.now() });
    await adminLogs({ scope: 'invite', action: 'create', token: tok, exp });
    setValue('invite-link', urlWithInvite(tok));
    setText('invite-status', `Token created. Expires ${new Date(exp).toLocaleString()} (48h).`);
  }
  window.open(`/join.html?invite=${encodeURIComponent(tok)}`, '_blank', 'noopener');
});

// ======================================================================
//              AUTO SWITCH FUNCTION (kept separate, called above)
// ======================================================================
function autoSwitchToParentIfInvite() {
  if (coachLockActive()) return;
  const tok = new URL(location.href).searchParams.get("invite");
  if (!tok) return; // only run if ?invite= is in URL
  const panel = document.querySelector('main[data-panel="parent"]');
  if (!panel) return;
  panel.hidden = false;
  const hdr = panel.querySelector('.section-hdr');
  const body = panel.querySelector('.section-body');
  if (hdr && !hdr.classList.contains('open')) hdr.classList.add('open');
  if (body) { body.style.maxHeight = '2000px'; body.style.padding = '12px'; }
}
