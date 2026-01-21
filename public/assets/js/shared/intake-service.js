// public/assets/js/shared/intake-service.js
// exposes helpers on window.Intakes (no imports)

// --- ID minting (padlock & UID) ---
function padlockToStr(n){ return String(n).padStart(6,'0'); }

async function mintNextPadlock(){
  const n = (Number(localStorage.getItem('padlockCounter')||'0') || 0) + 1;
  localStorage.setItem('padlockCounter', String(n));
  return padlockToStr(n);         // "000013"
}

function mintUid(track /* 'F8'|'F4' */){
  const key = `uidCounter_${track}`;
  const n = (Number(localStorage.getItem(key)||'0') || 0) + 1;
  localStorage.setItem(key, String(n));
  return `${track}-${String(n).padStart(4,'0')}`;   // e.g. F8-0062
}

// --- Pending intake storage (dev shim) ---
const PENDING = (() => {
  const KEY = 'pendingIntakes';
  const read = () => JSON.parse(localStorage.getItem(KEY) || '[]');
  const write = (arr) => localStorage.setItem(KEY, JSON.stringify(arr));
  return { read, write, KEY };
})();

function listPendingIntakes(){
  return PENDING.read(); // [{token, first, last, dob, ...}, ...]
}

function getIntakeByToken(token){
  return listPendingIntakes().find(x => x.token === token) || null;
}

function removeIntakeByToken(token){
  PENDING.write(listPendingIntakes().filter(x => x.token !== token));
}

// --- Approve flow (dev stub) ---
function approveIntake({ token, track, tier }){
  const intake = getIntakeByToken(token);
  if(!intake) throw new Error('Intake not found');

  const uid     = mintUid(track);        // F8-xxxx / F4-xxxx
  const padlock = mintNextPadlock();     // 000001…

  const athlete = {
    uid, padlock,
    first: intake.first, last: intake.last,
    publicInitial: `${intake.first?.[0] || ''}.`,
    publicLast: intake.last || '',
    track, tier, lane: 'combat',
    createdAt: new Date().toISOString(),
    status: 'active'
  };

  // store athlete list in localStorage for now (dev)
  const KEY = 'athletes';
  const arr = JSON.parse(localStorage.getItem(KEY)||'[]');
  arr.push(athlete);
  localStorage.setItem(KEY, JSON.stringify(arr));

  removeIntakeByToken(token);
  return athlete;
}

// expose
window.Intakes = {
  listPendingIntakes,
  getIntakeByToken,
  approveIntake,
  mintUid,
  mintNextPadlock
};
