// pairing.service.js — device↔athlete pairing (localStorage stub)
// Swap storage layer later to Firebase; keep same API.

const LS_PAIR = "sm_pairings_v1"; // { deviceId: { athleteId, parentName, pinOk, ts } }
const LS_PIN  = "sm_pins_v1";     // demo PIN table: { "A000001":"1234", ... }

function load(k, d={}){ try{ return JSON.parse(localStorage.getItem(k))||d }catch{return d} }
function save(k, v){ localStorage.setItem(k, JSON.stringify(v)) }
function deviceId(){ let id = localStorage.getItem("sm_device_id"); if(!id){ id = crypto.randomUUID(); localStorage.setItem("sm_device_id", id); } return id; }

export function getPairing(){
  const map = load(LS_PAIR); return map[deviceId()] || null;
}

export function setDemoPin(athleteId, pin){ const pins=load(LS_PIN); pins[athleteId]=String(pin); save(LS_PIN,pins); }

export async function pairDevice({ athleteId, parentName, pin }){
  athleteId = (athleteId||"").trim().toUpperCase();
  parentName = (parentName||"").trim();
  if(!athleteId || !pin) throw new Error("Missing athleteId or PIN");

  // demo verify
  const pins = load(LS_PIN);
  const ok = String(pins[athleteId]||"1234") === String(pin);

  const map = load(LS_PAIR);
  map[deviceId()] = { athleteId, parentName, pinOk: ok, ts: Date.now() };
  save(LS_PAIR, map);
  return map[deviceId()];
}

export function unpairDevice(){
  const map = load(LS_PAIR); delete map[deviceId()]; save(LS_PAIR, map);
}

export function requireAthleteId(){
  const p = getPairing();
  return p?.athleteId || (new URLSearchParams(location.search).get("athleteId")||"").toUpperCase();
}
