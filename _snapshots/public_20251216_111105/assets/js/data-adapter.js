// Unified data adapter: uses Firestore if permitted, else localStorage.
// Import this in coaches-tools.js, coaches-ceremonies.js, etc.

let _db = null;
try {
  // optional import only if you already load firebase-init.js
  // eslint-disable-next-line no-undef
  _db = typeof db !== "undefined" ? db : null;
} catch (_) { _db = null; }

// Helpers
const ok = (v) => v !== undefined && v !== null;
const lsKey = (col) => `mock:${col}`;

// Read list
export async function listDocs(collectionName, queryFn = null) {
  if (_db) {
    try {
      const { collection, getDocs, query } = await import(
        "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js"
      );
      const base = collection(_db, collectionName);
      const q = queryFn ? queryFn(base) : base;
      const snap = await getDocs(q);
      return snap.docs.map(d => ({ id: d.id, ...d.data() }));
    } catch (err) {
      console.warn(`[adapter] Firestore list fallback -> localStorage`, err);
    }
  }
  const raw = localStorage.getItem(lsKey(collectionName));
  return raw ? JSON.parse(raw) : [];
}

// Create / update (merge by id if present)
export async function saveDoc(collectionName, data, id = null) {
  if (_db) {
    try {
      const { collection, addDoc, doc, setDoc, serverTimestamp } = await import(
        "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js"
      );
      const col = collection(_db, collectionName);
      const payload = { ...data };
      if (!ok(payload.createdAt)) payload.createdAt = serverTimestamp();
      if (id) { await setDoc(doc(col, id), payload, { merge: true }); return id; }
      const ref = await addDoc(col, payload); return ref.id;
    } catch (err) {
      console.warn(`[adapter] Firestore save fallback -> localStorage`, err);
    }
  }
  // local fallback
  const key = lsKey(collectionName);
  const list = JSON.parse(localStorage.getItem(key) || "[]");
  const _id = id || crypto.randomUUID();
  const idx = list.findIndex(x => x.id === _id);
  const now = Date.now();
  const item = { id: _id, createdAt: now, ...data };
  if (idx >= 0) list[idx] = { ...list[idx], ...item };
  else list.push(item);
  localStorage.setItem(key, JSON.stringify(list));
  return _id;
}

// Delete
export async function deleteDocById(collectionName, id) {
  if (_db) {
    try {
      const { doc, deleteDoc, collection } = await import(
        "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js"
      );
      await deleteDoc(doc(collection(_db, collectionName), id));
      return;
    } catch (err) {
      console.warn(`[adapter] Firestore delete fallback -> localStorage`, err);
    }
  }
  const key = lsKey(collectionName);
  const list = JSON.parse(localStorage.getItem(key) || "[]").filter(x => x.id !== id);
  localStorage.setItem(key, JSON.stringify(list));
}
