// Sandman Silver — Firestore Live Wiring Scaffold (Nov 13)
// This file keeps the same API you already call from silver.app/ui files.
// Flip LIVE=true to connect to Firestore (emulators or prod depending on firebase-init.js).

import {
  db,
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  serverTimestamp,
  query,
  where,
  orderBy,
  limit as qLimit,
} from "/assets/js/firebase-init.js";

// ------------------------------------------------------
// Config switches
// ------------------------------------------------------
export let LIVE = false;          // ← flip to true when ready
export let MIRROR_LEADERBOARD = false; // optional mirror after approve

export function setLive(v = true) { LIVE = !!v; }
export function getLive() { return LIVE; }

// ------------------------------------------------------
// Local fallback (for dummy mode) — minimal, namespaced
// ------------------------------------------------------
const LS = {
  get(k, d=null){ try{ return JSON.parse(localStorage.getItem(k)) ?? d } catch { return d } },
  set(k, v){ localStorage.setItem(k, JSON.stringify(v)); },
  del(k){ localStorage.removeItem(k); }
};
const NS = {
  intake(token){ return `silver:intake:${token}`; },
  intakeIndex(){ return `silver:intake:index`; },
  athlete(uid){ return `silver:ath:${uid}`; }
};

// ------------------------------------------------------
// Canonical maps (tiers, ranks, caps)
// ------------------------------------------------------
const F8_RANKS = ["shadow","recruit","combatant","competitor","warrior","champion","commander","sandman","hero"]; // T0..T8
const F4_RANKS = ["apprentice","warrior","champion","veteran","legend"]; // T0..T4

const CAPS = {
  foundry8: { T0:800,T1:1000,T2:1200,T3:1400,T4:1600,T5:1800,T6:2000,T7:2200,T8:2400 },
  foundry4: { T0:1200,T1:1400,T2:1600,T3:2200,T4:2400 },
};

function rankFrom(trackBase, tier){
  const idx = Number(String(tier).replace(/\D/g,"")) || 0;
  if (trackBase === "foundry8") return F8_RANKS[idx] ?? F8_RANKS[0];
  if (trackBase === "foundry4") return F4_RANKS[idx] ?? F4_RANKS[0];
  return "apprentice";
}

function capFrom(trackBase, tier){
  const key = `T${Number(String(tier).replace(/\D/g,""))||0}`;
  return CAPS[trackBase]?.[key] ?? 1000;
}

// ------------------------------------------------------
// UID mint — predictable but unique; override if you have a server mint
// ------------------------------------------------------
function pad(n, w){ return String(n).padStart(w, "0"); }
export function mintUid({ trackBase = "foundry8", team = "TN" } = {}){
  const lane = (trackBase === "foundry4") ? "F4" : "F8";
  const ts = Date.now().toString().slice(-5); // last 5 digits of epoch
  const rand = Math.floor(Math.random()*90)+10; // 2-digit random for safety
  return `${lane}-${team.toUpperCase()}${ts}${rand}`; // e.g., F8-TN1234512
}

// ------------------------------------------------------
// Intakes — save/load/list
// ------------------------------------------------------
export async function saveIntake(token, data){
  if (!token) throw new Error("Missing token");
  if (!LIVE){
    // index for list
    const idx = LS.get(NS.intakeIndex(), []);
    if (!idx.includes(token)) { idx.push(token); LS.set(NS.intakeIndex(), idx); }
    LS.set(NS.intake(token), { ...data, createdAt: Date.now(), status: data.status || "SUBMITTED" });
    return { ok:true, mode:"LOCAL" };
  }
  await setDoc(doc(db, "intakes", token), { ...data, createdAt: serverTimestamp() }, { merge:true });
  return { ok:true, mode:"LIVE" };
}

export async function loadIntake(token){
  if (!token) throw new Error("Missing token");
  if (!LIVE){ return LS.get(NS.intake(token), null); }
  const snap = await getDoc(doc(db, "intakes", token));
  return snap.exists() ? snap.data() : null;
}

export async function listIntakes({ status = "SUBMITTED", max = 25 } = {}){
  if (!LIVE){
    const idx = LS.get(NS.intakeIndex(), []);
    const all = idx.map(t => ({ token:t, ...LS.get(NS.intake(t), {}) }))
                  .filter(x => x && (!status || x.status === status))
                  .sort((a,b)=> (b.createdAt||0)-(a.createdAt||0));
    return all.slice(0, max);
  }
  let q = query(collection(db, "intakes"), where("status","==", status), orderBy("createdAt","desc"), qLimit(max));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ token:d.id, ...d.data() }));
}

// ------------------------------------------------------
// Approve flow — mint UID, write athlete, mark intake approved
// ------------------------------------------------------
export async function approveIntake({
  token,
  trackBase = "foundry8",
  team = "TN",
  publicInitial = "",
  publicLast = "",
  city = "",
  state = "",
}){
  if (!token) throw new Error("Missing token");
  const intake = await loadIntake(token);
  if (!intake) throw new Error("Intake not found");
  if (!intake.waiverViewed || !intake.waiverAccepted) {
    throw new Error("Cannot approve until waiver is viewed and accepted");
  }

  const tier = "T0";
  const uid = mintUid({ trackBase, team });
  const fullName = `${publicInitial || (intake.first?.[0]||"")}. ${publicLast || (intake.last?.[0]||"")}`.trim();
  const rankKey = rankFrom(trackBase, tier);
  const xpCap = capFrom(trackBase, tier);

  const athleteDoc = {
    uid,
    trackBase,
    tier,
    rankKey,
    fullName,
    team: team,
    city: city || intake.city || "",
    state: state || intake.state || "",
    xp: 0,
    stripeCount: 0,
    padlock: true,
    createdAt: LIVE ? serverTimestamp() : Date.now(),
  };

  if (!LIVE){
    // write athlete locally
    LS.set(NS.athlete(uid), athleteDoc);
    // mark intake approved
    LS.set(NS.intake(token), { ...intake, status:"APPROVED", approvedAt: Date.now(), finalUid: uid });
  } else {
    // live writes
    await setDoc(doc(db, "athletes", uid), athleteDoc, { merge:true });
    await updateDoc(doc(db, "intakes", token), { status:"APPROVED", approvedAt: serverTimestamp(), finalUid: uid });

    if (MIRROR_LEADERBOARD){
      const track = trackBase; // same key you use in leaderboards.html
      await setDoc(doc(db, `leaderboards/${track}/months/${yyyymm(new Date())}/entries`, uid), {
        uid,
        xp: 0,
        createdAt: serverTimestamp(),
      }, { merge:true });
    }
  }

  // cache lastApprovedUid for the Athlete panel mirror
  try { localStorage.setItem("silver:lastApprovedUid", uid); } catch {}

  return { ok:true, uid, rankKey, xpCap, trackBase };
}

// ------------------------------------------------------
// Reads (athlete mirror)
// ------------------------------------------------------
export async function readAthlete(uid){
  if (!uid) return null;
  if (!LIVE){ return LS.get(NS.athlete(uid), null); }
  const snap = await getDoc(doc(db, "athletes", uid));
  return snap.exists() ? snap.data() : null;
}

// ------------------------------------------------------
// Utils
// ------------------------------------------------------
function yyyymm(d){
  const yyyy = d.getFullYear();
  const mm = (d.getMonth()+1).toString().padStart(2,"0");
  return `${yyyy}-${mm}`;
}

// ------------------------------------------------------
// Public API (stable surface for silver.app/ui)
// ------------------------------------------------------
const SilverCore = {
  setLive,
  getLive,
  mintUid,
  saveIntake,
  loadIntake,
  listIntakes,
  approveIntake,
  readAthlete,
  rankFrom,
  capFrom,
};

export default SilverCore;
