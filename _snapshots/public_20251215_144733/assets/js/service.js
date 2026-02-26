// public/assets/js/service.js
// Frontend wiring for callable Functions (emulator)

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getFunctions,
  connectFunctionsEmulator,
  httpsCallable,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js";

// ---- config for emulator-only ----
// Use YOUR local project id used by `firebase emulators:start`.
// You've been using "sandmandashboard" in earlier shots; keep that here.
const firebaseConfig = {
  apiKey: "fake-api-key",      // emulator-safe placeholder
  projectId: "sandmandashboard",
  appId: "demo-web-app",       // any string is fine in emulator
};

const app = initializeApp(firebaseConfig);
const fns = getFunctions(app);

// Point Functions SDK at the local emulator (matches your terminal: port 5001)
connectFunctionsEmulator(fns, "127.0.0.1", 5001);

// ----- exported helpers your test page can call -----
export async function pingFn(payload = { hello: "world" }) {
  const ping = httpsCallable(fns, "ping");
  const res = await ping(payload);
  return res.data;
}

export async function incrementXpFn({ uid, track, type }) {
  if (!uid || !track || !type) throw new Error("uid, track, type required");
  const inc = httpsCallable(fns, "incrementXp");
  const res = await inc({ uid, track, type });
  return res.data;
}
// Ensure this runs before coach-activate.js
window.DB = window.DB || {
  _cols: {},
  _ensure(name) {
    if (!this._cols[name]) this._cols[name] = new Map();
    return this._cols[name];
  },
  async add(name, obj) {
    const col = this._ensure(name);
    const id = (crypto && crypto.randomUUID) ? crypto.randomUUID() : String(Math.random()).slice(2);
    const doc = { id, ...obj };
    col.set(id, doc);
    return doc;
  },
  async set(name, id, partial) {
    const col = this._ensure(name);
    const prev = col.get(id) || { id };
    const next = { ...prev, ...partial };
    col.set(id, next);
    return next;
  },
  async get(name, id) {
    const col = this._ensure(name);
    return col.get(id) || null;
  }
};
