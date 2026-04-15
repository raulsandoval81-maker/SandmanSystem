// public/assets/js/athlete-profile.js
// Shared: resolve athlete id from URL and load athlete doc safely.

import { db, doc, getDoc, ensureSignedIn } from "/assets/js/firebase-init.js";

export function resolveAthleteId() {
  const params = new URLSearchParams(location.search);
  return (params.get("id") || "").trim(); // ONLY support ?id=F4_0010 / F8_0003
}

function renderMissingId() {
  document.body.innerHTML = `
    <main style="max-width:900px;margin:40px auto;padding:16px;font-family:system-ui;color:#e8eef7">
      <h1 style="color:#ffd633;margin:0 0 10px">Missing athlete id</h1>
      <p style="margin:0 0 14px;color:#9ca3af">
        This page needs <code>?id=F4_0010</code>.
      </p>
      <div style="background:#0b1017;border:1px solid #1f2937;border-radius:12px;padding:12px">
        <div style="color:#e5e7eb;font-weight:800;margin-bottom:8px">Example</div>
        <code style="color:#cbd5e1">/athletes/lanes/strength/?id=F4_0010</code>
      </div>
    </main>
  `;
}

export async function getAthleteProfile({ silent = false } = {}) {
  const athleteId = resolveAthleteId();

  if (!athleteId) {
    if (!silent) renderMissingId();
    return null;
  }

  // Make sure auth is ready (your system expects signed-in)
  try {
    await ensureSignedIn();
  } catch (e) {
    // If your athlete pages allow anon, remove ensureSignedIn from firebase-init or adjust here.
    console.warn("ensureSignedIn failed:", e);
  }

  const ref = doc(db, "athletes", athleteId);
  const snap = await getDoc(ref);

  if (!snap.exists()) {
    if (!silent) {
      document.body.innerHTML = `
        <main style="max-width:900px;margin:40px auto;padding:16px;font-family:system-ui;color:#e8eef7">
          <h1 style="color:#ffd633;margin:0 0 10px">Athlete profile not found</h1>
          <p style="margin:0 0 14px;color:#9ca3af">
            No document at <code>athletes/${athleteId}</code>.
          </p>
        </main>
      `;
    }
    return null;
  }

  return { id: athleteId, ...snap.data() };
}

export function isFoundry8Id(athleteId) {
  return String(athleteId || "").startsWith("F8_");
}