// public/assets/js/shared/ids.service.js

// --- Firestore helpers (from firebase-init.js) ---
import {
  db, doc, setDoc, addDoc, collection,
  serverTimestamp, runTransaction, getDoc
} from '../firebase-init.js';

// everything else in this file (nextPadlock, mintUid, setStatus, etc.)
// stays as-is, just make sure they get exported if used in other files

export async function nextPadlock() {
  const ref = doc(db, 'meta', 'padlock');
  return runTransaction(db, async tx => {
    const snap = await tx.get(ref);
    const n = snap.exists() ? (snap.data().next || 1) : 1;
    tx.set(ref, { next: n + 1 }, { merge: true });
    return String(n).padStart(6, '0');
  });
}

export function mintUid(track) {
  const d = new Date();
  const yymm = String(d.getFullYear()).slice(-2) + String(d.getMonth() + 1).padStart(2, '0');
  const seq = Math.floor(Math.random() * 10000);
  return `${track}-${yymm}-${String(seq).padStart(4, '0')}`;
}

// ====== UI Helpers ======
function setStatus(msg, cls = 'muted') {
  const el =
    document.getElementById('ids-status') ||
    document.getElementById('ca-status'); // fallback
  if (el) {
    el.className = `muted ${cls}`;
    el.textContent = msg;
  }
  console.log('[ids]', msg);
}

function set(id, val) {
  const el = document.getElementById(id);
  if (el) el.value = val;
}

// ====== Approve Button Handler ======
document.getElementById('ca-approve').onclick = async () => {
  const approveBtn = document.getElementById('ca-approve');
  const intakeId = approveBtn?.dataset.intakeId;
  if (!intakeId) {
    setStatus('Load an intake first.', 'text-warn');
    return;
  }

  const trackVal = document.getElementById('ca-track').value; // 'F8' or 'F4'
  const tierCode = document.getElementById('ca-tier').value;   // 'T0'..'T8'

  const uid = mintUid(trackVal);
  const padlockId = await nextPadlock();

  // Reflect values in UI
  set('ca-uid', uid);
  set('ca-padlock', padlockId);

  // Mark intake approved
  await setDoc(doc(db, 'intakes', intakeId), {
    status: 'approved',
    approvedTo: uid,
    approvedAt: serverTimestamp(),
  }, { merge: true });

  setStatus('Approved. UID and Padlock minted.', 'text-ok');
};
