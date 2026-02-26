// public/assets/js/shared/id-service.js
import { db, doc, getDoc, runTransaction } from '../firebase-init.js';

/** Atomically increments a named counter in /counters/{name} and returns the new value (1-based). */
export async function nextCounter(name) {
  const ref = doc(db, 'counters', name);
  const val = await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    const curr = snap.exists() ? (snap.data().value || 0) : 0;
    const next = curr + 1;
    tx.set(ref, { value: next, updatedAt: Date.now() }, { merge: true });
    return next;
  });
  return val;
}

/** 000001, 000002, ... (6 digits, zero-padded) */
export function formatPadlock(n) {
  return String(n).padStart(6, '0');
}

/** F8-0001 / F4-0001 ... (4 digits, zero-padded) */
export function mintUidFor(track /* 'F8'|'F4' */, n) {
  const seq = String(n).padStart(4, '0');
  return `${track}-${seq}`;
}
