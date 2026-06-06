// /public/athletes/lanes/strength/strength.js
// Strength Lane Runtime (V1 cleaned + mobile-safe nav)

import {
  db,
  ensureSignedIn,
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
} from "/assets/js/firebase-init.js";

await ensureSignedIn();

const container = document.getElementById("strength-session-container");
const params = new URLSearchParams(location.search);
const athleteId = (params.get("id") || "").trim().toUpperCase();

const descRes = await fetch("/vault/strength/iron/descriptions.json");
const desc = await descRes.json();

const ACTIVE_LANE = "strength";
const ACTIVE_SEGMENT_ID = "segment1";

let sessionN = 1;

// Mobile/browser cache safety
window.addEventListener("pageshow", (e) => {
  if (e.persisted) {
    window.location.reload();
  }
});

function esc(str = "") {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function isFoundry8(id = "") {
  return /^F8[_-]/i.test(id);
}

function fatalMissingId() {
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
  throw new Error("Missing athlete id (query param ?id=...)");
}

function goToHub() {
  window.location.href = `/athletes/hub/index.html?id=${encodeURIComponent(athleteId)}`;
}

async function fetchJson(url) {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`Vault fetch failed: ${res.status} ${res.statusText} @ ${url}`);
  }
  return res.json();
}

function renderList(items = []) {
  if (!Array.isArray(items) || !items.length) return "";
  return `
    <ul style="margin:.5rem 0 0 1.1rem;padding:0;line-height:1.5;">
      ${items.map((x) => `<li>${esc(String(x))}</li>`).join("")}
    </ul>
  `;
}

function renderExerciseList(items = []) {
  if (!Array.isArray(items) || !items.length) return "";
  return `
    <ul style="margin:.5rem 0 0 1.1rem;padding:0;line-height:1.5;">
      ${items
        .map((x) => {
          if (typeof x === "string") return `<li>${esc(x)}</li>`;
          const ex = x?.exercise || x?.name || "";
          const sets = x?.sets ? ` — ${x.sets}` : "";
          const reps = x?.reps ? ` x ${x.reps}` : "";
          const notes = x?.notes ? ` (${x.notes})` : "";
          return `<li>${esc(`${ex}${sets}${reps}${notes}`)}</li>`;
        })
        .join("")}
    </ul>
  `;
}

function buildGeneratedStrengthSession(n, explosiveLib, workoutA, workoutB, workoutC) {
  const cycle = ["A", "B", "C"];
  const rotation = cycle[(n - 2) % 3];

  const iron =
    rotation === "A"
      ? workoutA
      : rotation === "B"
      ? workoutB
      : workoutC;

  const explosivePool = Array.isArray(explosiveLib?.explosive)
    ? explosiveLib.explosive
    : [];

  const explosive = explosivePool.length
    ? explosivePool[(n - 2) % explosivePool.length]
    : null;

  const season = "postseason";
  const seasonBlock =
    iron?.seasonBlocks?.[season] ||
    iron?.seasonBlocks?.postseason ||
    iron ||
    null;

  return {
    n,
    id: `STR-${String(n).padStart(3, "0")}`,
    type: "training",
    rotation,
    title: iron?.label || `Workout ${rotation}`,
    prompt:
      iron?.tagline ||
      "Complete today’s session in order and log your best work.",
    deliverable:
      iron?.loggingRule?.prompt ||
      "Submit your best working set and a short note on effort and form.",
    coachNote:
      iron?.coachNote ||
      iron?.intensityRule ||
      "Keep reps clean and honest.",
    generated: {
      season,
      explosive,
      iron,
      seasonBlock,
    },
  };
}

function resolveRemoteHiitPreset(session, hiitData) {
  const presetId = String(session?.preset || "").trim();
  if (!presetId) return null;

  const presets = Array.isArray(hiitData?.presets) ? hiitData.presets : [];
  const levels = Array.isArray(hiitData?.levels) ? hiitData.levels : [];

  const presetMap = {
    level1: "F4_REMOTE_BASE",
    level2: "F4_REMOTE_PRESSURE",
    level3: "F4_REMOTE_PRESSURE",
  };

  const normalizedPresetId = presetMap[presetId] || presetId;

  const preset =
    presets.find((p) => String(p.id).trim() === normalizedPresetId) || null;

  if (!preset) return null;

  const level =
    levels.find((l) => String(l.id).trim() === String(preset.levelId || "").trim()) || null;

  return {
    resetBetweenPeriodsSec: Number(hiitData?.resetBetweenPeriodsSec || 120),
    preset,
    level,
  };
}

function renderResponseBlock(session, existing, isEditable, desc = {}) {
  const g = session?.generated;
  const explosive = g?.explosive;
  const seasonBlock = g?.seasonBlock;

  // BASELINE (Session 1 / 40)
  if (session.track?.baseline?.fields) {
    return `
      <div style="margin-top:1rem;">
        <div style="font-weight:800;margin-bottom:.5rem;">Results</div>

        ${session.track.baseline.fields.map((f) => `
          <div style="margin-bottom:.6rem;">
            <div style="font-size:.85rem;opacity:.7;margin-bottom:.2rem;">
              ${f.label}
            </div>

            <input
              id="baseline-${f.key}"
              type="${
                f.key === "mile_time" || f.key === "plank"
                  ? "text"
                  : "number"
              }"
              step="any"
              value="${esc(existing?.baselineResults?.[f.key] || "")}"
              placeholder="${f.placeholder || ""}"
              style="width:100%;padding:.6rem;border-radius:8px;border:1px solid #333;background:#0f1115;color:#fff;"
              ${!isEditable ? "disabled" : ""}
            />
          </div>
        `).join("")}
      </div>
    `;
  }

  // REMOTE HIIT
  if (session.type === "remote_hiit") {
    const hiit = session?.generated?.hiit || null;
    const preset = hiit?.preset || null;
    const level = hiit?.level || null;
    const interval = level?.interval || null;

    return `
      <div style="margin-top:1rem;">
        <div style="padding:1rem;border:1px solid #3b82f6;border-radius:12px;background:#0b1220;">

          <div style="font-weight:900;margin-bottom:.4rem;">Remote Conditioning Session</div>

          ${
            preset?.label
              ? `<div style="opacity:.9;margin-bottom:.35rem;"><strong>Preset:</strong> ${esc(preset.label)}</div>`
              : ""
          }

          ${
            level?.label
              ? `<div style="opacity:.85;margin-bottom:.35rem;"><strong>Level:</strong> ${esc(level.label)}</div>`
              : ""
          }

          ${
            interval
              ? `<div style="opacity:.85;margin-bottom:.35rem;">
                  <strong>Interval:</strong> ${esc(String(interval.workSec || "?"))}s work / ${esc(String(interval.restSec || "?"))}s rest
                </div>`
              : ""
          }

          ${
            preset
              ? `<div style="opacity:.85;margin-bottom:.35rem;">
                  <strong>Rounds:</strong> ${esc(String(preset.rounds || level?.periods || "?"))}
                  ${level?.periodMinutes ? ` • <strong>Period:</strong> ${esc(String(level.periodMinutes))} min` : ""}
                  ${hiit?.resetBetweenPeriodsSec ? ` • <strong>Reset:</strong> ${esc(String(Math.round(hiit.resetBetweenPeriodsSec / 60)))} min` : ""}
                </div>`
              : ""
          }

          ${
            preset?.notes || level?.notes
              ? `<div style="opacity:.82;margin:.5rem 0 .75rem;">
                  ${esc(preset?.notes || level?.notes || "")}
                </div>`
              : ""
          }

          ${
            Array.isArray(preset?.movements) && preset.movements.length
              ? `
                <div style="font-weight:800;margin:.5rem 0 .35rem;">Movements</div>
                ${renderList(preset.movements)}
              `
              : renderList(session.workout)
          }

          <textarea
            id="strength-conditioning"
            placeholder="Rounds completed, total time, hardest movement"
            style="width:100%;min-height:90px;margin-top:.75rem;padding:.75rem;border-radius:8px;border:1px solid #27304a;background:#111827;color:#e8eef7;"
            ${!isEditable ? "disabled" : ""}
          >${esc(existing?.conditioning || "")}</textarea>

        </div>
      </div>
    `;
  }

  // NORMAL (iron / explosive)
  return `
    <div style="margin-top:1rem;display:grid;gap:1rem;">

      ${
        explosive
          ? `
          <div style="padding:1rem;border:1px solid #1f2937;border-radius:12px;background:#0b1017;">
            <div style="font-weight:900;margin-bottom:.4rem;">Explosive</div>
            ${
              desc?.explosive?.desc
                ? `<div style="opacity:.85;margin-bottom:.5rem;">${esc(desc.explosive.desc)}</div>`
                : ""
            }
            ${renderExerciseList([explosive])}
            <textarea
              id="strength-explosive"
              placeholder="${esc(desc?.explosive?.prompt || "What did you actually do here?")}"
              style="width:100%;min-height:90px;margin-top:.75rem;padding:.75rem;border-radius:8px;border:1px solid #27304a;background:#111827;color:#e8eef7;"
              ${!isEditable ? "disabled" : ""}
            >${esc(existing?.explosive || "")}</textarea>
          </div>
          `
          : ""
      }

      ${
        seasonBlock?.mainLift?.length
          ? `
          <div style="padding:1rem;border:1px solid #1f2937;border-radius:12px;background:#0b1017;">
            <div style="font-weight:900;margin-bottom:.4rem;">Main Lift</div>
            ${
              desc?.mainLift?.desc
                ? `<div style="opacity:.85;margin-bottom:.5rem;">${esc(desc.mainLift.desc)}</div>`
                : ""
            }
            ${renderExerciseList(seasonBlock.mainLift)}
            <textarea
              id="strength-main"
              placeholder="${esc(desc?.mainLift?.prompt || "Top set, reps, weight, how it felt")}"
              style="width:100%;min-height:90px;margin-top:.75rem;padding:.75rem;border-radius:8px;border:1px solid #27304a;background:#111827;color:#e8eef7;"
              ${!isEditable ? "disabled" : ""}
            >${esc(existing?.main || "")}</textarea>
          </div>
          `
          : ""
      }

      ${
        seasonBlock?.secondaryLift?.length
          ? `
          <div style="padding:1rem;border:1px solid #1f2937;border-radius:12px;background:#0b1017;">
            <div style="font-weight:900;margin-bottom:.4rem;">Secondary Lift</div>
            ${
              desc?.secondaryLift?.desc
                ? `<div style="opacity:.85;margin-bottom:.5rem;">${esc(desc.secondaryLift.desc)}</div>`
                : ""
            }
            ${renderExerciseList(seasonBlock.secondaryLift)}
            <textarea
              id="strength-secondary"
              placeholder="${esc(desc?.secondaryLift?.prompt || "What did you hit here?")}"
              style="width:100%;min-height:90px;margin-top:.75rem;padding:.75rem;border-radius:8px;border:1px solid #27304a;background:#111827;color:#e8eef7;"
              ${!isEditable ? "disabled" : ""}
            >${esc(existing?.secondary || "")}</textarea>
          </div>
          `
          : ""
      }

      ${
        seasonBlock?.assistance?.length
          ? `
          <div style="padding:1rem;border:1px solid #1f2937;border-radius:12px;background:#0b1017;">
            <div style="font-weight:900;margin-bottom:.4rem;">Assistance</div>
            ${
              desc?.assistance?.desc
                ? `<div style="opacity:.85;margin-bottom:.5rem;">${esc(desc.assistance.desc)}</div>`
                : ""
            }
            ${renderExerciseList(seasonBlock.assistance)}
            <textarea
              id="strength-assistance"
              placeholder="${esc(desc?.assistance?.prompt || "What got done? What broke down?")}"
              style="width:100%;min-height:90px;margin-top:.75rem;padding:.75rem;border-radius:8px;border:1px solid #27304a;background:#111827;color:#e8eef7;"
              ${!isEditable ? "disabled" : ""}
            >${esc(existing?.assistance || "")}</textarea>
          </div>
          `
          : ""
      }

      ${
        seasonBlock?.conditioning?.options?.length
          ? `
          <div style="padding:1rem;border:1px solid #1f2937;border-radius:12px;background:#0b1017;">
            <div style="font-weight:900;margin-bottom:.4rem;">Conditioning Finish</div>
            ${
              desc?.conditioning?.desc
                ? `<div style="opacity:.85;margin-bottom:.5rem;">${esc(desc.conditioning.desc)}</div>`
                : ""
            }
            ${renderList(seasonBlock.conditioning.options)}
            <textarea
              id="strength-conditioning"
              placeholder="${esc(desc?.conditioning?.prompt || "How did you finish? Did you complete it clean?")}"
              style="width:100%;min-height:90px;margin-top:.75rem;padding:.75rem;border-radius:8px;border:1px solid #27304a;background:#111827;color:#e8eef7;"
              ${!isEditable ? "disabled" : ""}
            >${esc(existing?.conditioning || "")}</textarea>
          </div>
          `
          : ""
      }

    </div>
  `;
}

async function loadStrengthSession() {
  if (!container) {
    console.error("Missing #strength-session-container in DOM");
    return;
  }

  if (!athleteId) fatalMissingId();

  const subSnap = await getDoc(doc(db, "laneSubmissions", athleteId));
  const submissions = subSnap.exists() ? subSnap.data() : {};

  const approved = Object.values(submissions)
    .filter((s) => {
      const lane = String(s?.lane || "").toLowerCase();
      const status = String(s?.status || "").toLowerCase();
      return lane === ACTIVE_LANE && (status === "approved" || status === "closed");
    })
    .sort((a, b) => Number(b?.sessionN || 0) - Number(a?.sessionN || 0));

  const debugSession = Number(params.get("n") || 0);

  sessionN = debugSession > 0
    ? debugSession
    : approved.length
      ? Number(approved[0].sessionN || 0) + 1
      : 1;

if (isFoundry8(athleteId)) {
  if (tierNum < 3) {
    container.innerHTML = `
      <div class="lane-card">
        Strength unlocks at Competitor.
      </div>
    `;
    return;
  }

  if (stripe < 1) {
    container.innerHTML = `
      <div class="lane-card">
        Strength unlocks at Competitor Stripe 1.
      </div>
    `;
    return;
  }
}

  const backLink = document.querySelector("a.btn-back");
  if (backLink) {
    backLink.href = `/athletes/hub/index.html?id=${encodeURIComponent(athleteId)}`;
    backLink.addEventListener("click", (e) => {
      e.preventDefault();
      goToHub();
    });
  }

  const backBtn = document.getElementById("backBtn");
  if (backBtn) {
    backBtn.addEventListener("click", (e) => {
      e.preventDefault();
      goToHub();
    });
  }

  try {
    const [athleteSnap, sessionData, explosiveLib, workoutA, workoutB, workoutC, hiitData] = await Promise.all([
      getDoc(doc(db, "athletes", athleteId)),
      fetchJson(`/vault/${ACTIVE_LANE}/${ACTIVE_SEGMENT_ID}/sessions.json`),
      fetchJson("/vault/strength/explosive/library.json").catch(() => null),
      fetchJson("/vault/strength/iron/workoutA.json").catch(() => null),
      fetchJson("/vault/strength/iron/workoutB.json").catch(() => null),
      fetchJson("/vault/strength/iron/workoutC.json").catch(() => null),
      fetchJson("/vault/strength/remote-hiit/presets.json").catch(() => null),
    ]);

    if (!athleteSnap.exists()) {
      container.innerHTML = `<div style="opacity:.7;">Athlete profile not found for <code>${esc(athleteId)}</code>.</div>`;
      return;
    }

    const athlete = athleteSnap.data() || {};
    const stripe = Number(athlete.stripeCount ?? athlete.stripesEarned ?? 0);


    const vaultSessions = Array.isArray(sessionData)
      ? sessionData
      : (sessionData.sessions || []);

    let session = vaultSessions.find((s) => Number(s?.n) === Number(sessionN)) || null;

    const generated =
      sessionN >= 2 && sessionN <= 39
        ? buildGeneratedStrengthSession(
            sessionN,
            explosiveLib,
            workoutA,
            workoutB,
            workoutC,
          )
        : null;

    if (session?.type === "iron" && session?.rotationMode === "ABC") {
      session = {
        ...session,
        rotation: generated?.rotation || session.rotation,
        generated: generated?.generated || null,
      };
    } else if (session?.type === "explosive") {
      session = {
        ...session,
        generated: generated?.generated || null,
      };
    } else if (!session && generated) {
      session = generated;
    }

    if (session?.type === "remote_hiit") {
      session = {
        ...session,
        generated: {
          ...(session.generated || {}),
          hiit: resolveRemoteHiitPreset(session, hiitData),
        },
      };
    }

    if (!session) {
      container.innerHTML = `<div style="opacity:.6;">Strength Session ${esc(sessionN)} not found in vault.</div>`;
      return;
    }

    let subDoc = {};
    try {
      const subSnap2 = await getDoc(doc(db, "laneSubmissions", athleteId));
      if (subSnap2.exists()) subDoc = subSnap2.data() || {};
    } catch (e) {
      console.warn("Could not read laneSubmissions:", e);
    }

    const SESSION_KEY = String(session.id || `STR-${String(sessionN).padStart(3, "0")}`);
    const existing = subDoc?.[SESSION_KEY] || null;
    const status = String(existing?.status || "new").toLowerCase();

    const isEditable = status === "new" || status === "needs_revision";
    const isPending = status === "pending";
    const isApproved = status === "approved" || status === "closed";
    const isRevision = status === "needs_revision";

    container.innerHTML = `

    
      <div class="lane-card">

      <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;">
  
  <div style="font-weight:900;font-size:1.1rem;">
    ${esc(session.title || `Iron Room - Session ${sessionN}`)}
  </div>

  ${
    session.type === "iron"
      ? `
        <button
          id="request-remote-btn"
          style="font-size:.75rem;padding:.3rem .55rem;border-radius:8px;border:1px solid #27304a;background:#0b1017;color:#9aa4b1;cursor:pointer;opacity:.85;"
        >
          Request Remote
        </button>
      `
      : ""
  }

</div>
        <div style="margin-top:.35rem;opacity:.72;font-size:.92rem;">
          ${esc(ACTIVE_SEGMENT_ID)} · Session ${esc(sessionN)}
          ${session.type ? ` • Type: ${esc(session.type)}` : ""}
          ${session.rotation ? ` • Rotation: ${esc(session.rotation)}` : ""}
        </div>

        <div style="margin-top:.9rem;padding:.9rem 1rem 1.1rem;border:1px solid #1f2937;border-radius:12px;background:#0b1017;">
          <div style="font-weight:900;color:#facc15;margin-bottom:.45rem;">
            STRENGTH
          </div>

          <div style="margin-top:.35rem;">
            <div style="font-weight:800;">Focus</div>
            <div>${esc(session.focus || "Move with posture. Finish with control.")}</div>
          </div>

          <div style="margin-top:.65rem;">
            <div style="font-weight:800;">Standard</div>
            <div>${esc(session.standard || "No lazy reps. No fake range. No quitting when it burns.")}</div>
          </div>

          <div style="margin-top:.65rem;opacity:.85;">
            <div style="font-weight:800;">Quote</div>
            <div style="font-style:italic;">
              ${esc(session.quote || "He who conquers himself is the mightiest warrior.")}
            </div>
            <div style="opacity:.7;font-size:.8rem;margin-top:.25rem;">
              ${esc(session.quoteAuthor || "— Confucius")}
            </div>
          </div>

          <div style="margin-top:.7rem;white-space:pre-wrap;line-height:1.5;">
            ${esc(session.prompt || session.body || "")}
          </div>

          ${
            session.workout?.length
              ? `
              <div style="margin-top:.85rem;">
                <div style="font-weight:800;">Workout</div>
                ${renderList(session.workout)}
              </div>
            `
              : ""
          }

          ${
            session.deliverable
              ? `
              <div style="margin-top:.8rem;opacity:.85;">
                <div style="font-weight:800;margin-bottom:.25rem;">Deliverable</div>
                <div>${esc(session.deliverable)}</div>
              </div>
            `
              : ""
          }

          ${
            session.coachNote
              ? `
              <div style="margin-top:.8rem;opacity:.75;">
                <div style="font-weight:800;margin-bottom:.25rem;">Coach Note</div>
                <div>${esc(session.coachNote)}</div>
              </div>
            `
              : ""
          }
        </div>

        ${renderResponseBlock(session, existing, isEditable, desc)}

        ${isRevision && existing?.coachNote ? `
          <div style="margin-top:.5rem;color:#ffcc00;">
            Coach: ${esc(existing.coachNote)}
          </div>
        ` : ""}

        <button
          id="strength-submit"
          style="margin-top:.75rem;padding:.6rem 1rem;background:#ffd633;color:#000;font-weight:800;border:none;border-radius:8px;cursor:pointer;"
          ${!isEditable ? "disabled" : ""}
        >
          ${isRevision ? "Resubmit" : isPending ? "Submitted" : "Submit"}
        </button>

        <div id="strength-status" style="margin-top:.5rem;font-size:.9rem;opacity:.7;">
          ${
            isPending
              ? "Submitted. Awaiting coach review."
              : isRevision
                ? "Revision requested. Update and resubmit."
                : isApproved
                  ? "Approved."
                  : ""
          }
        </div>
      </div>
    `;

    // 🔥 CORRECT placement (outside HTML)
const requestRemoteBtn = document.getElementById("request-remote-btn");

requestRemoteBtn?.addEventListener("click", async () => {
  const note = window.prompt("Why do you need a remote workout?");
  if (!note || !note.trim()) return;

  try {
    await setDoc(
      doc(db, "laneSubmissions", athleteId),
      {
        conditioning_request: {
          status: "pending",
          requestedAt: serverTimestamp(),
          note: note.trim(),
          lane: "conditioning",
          sourceLane: "strength",
          sourceSessionN: Number(sessionN),
          athleteUid: athleteId,
          athleteName: athlete.fullName || "",
        }
      },
      { merge: true }
    );

    requestRemoteBtn.disabled = true;
    requestRemoteBtn.textContent = "Request Sent";
  } catch (err) {
    console.error("Conditioning request error:", err);
    window.alert("Could not send request.");
  }
});

    if (isEditable) {
      const submitBtn = document.getElementById("strength-submit");
      const statusEl = document.getElementById("strength-status");

      submitBtn?.addEventListener("click", async () => {
        let body = "";
        let payload = {};

        if (session.track?.baseline?.fields) {
          const results = {};

          for (const f of session.track.baseline.fields) {
            const val = (document.getElementById(`baseline-${f.key}`)?.value || "").trim();
            results[f.key] = val;
          }

          const missing = session.track.baseline.fields.some((f) => {
            const val = String(results[f.key] || "").trim();

            if (f.key === "mile_time" || f.key === "plank") {
              return !val;
            }

            return isNaN(Number(val)) || val === "";
          });

          if (missing) {
            if (statusEl) statusEl.textContent = "Complete all baseline fields.";
            return;
          }

          body = session.track.baseline.fields
            .map((f) => `${f.label}: ${results[f.key] || ""}`)
            .join("\n");

          payload = {
            baselineResults: results,
          };
        } else if (session.type === "remote_hiit") {
          const conditioning = (document.getElementById("strength-conditioning")?.value || "").trim();

          if (!conditioning) {
            if (statusEl) statusEl.textContent = "Conditioning response required.";
            return;
          }

          body = `
Remote HIIT: ${conditioning}
          `.trim();

          payload = {
            conditioning,
          };
        } else {
          const explosive = (document.getElementById("strength-explosive")?.value || "").trim();
          const main = (document.getElementById("strength-main")?.value || "").trim();
          const secondary = (document.getElementById("strength-secondary")?.value || "").trim();
          const assistance = (document.getElementById("strength-assistance")?.value || "").trim();
          const conditioning = (document.getElementById("strength-conditioning")?.value || "").trim();

          if (!main) {
            if (statusEl) statusEl.textContent = "Main Lift required.";
            return;
          }

          body = `
Explosive: ${explosive}
Main Lift: ${main}
Secondary Lift: ${secondary}
Assistance: ${assistance}
Conditioning Finish: ${conditioning}
          `.trim();

          payload = {
            explosive,
            main,
            secondary,
            assistance,
            conditioning,
          };
        }

        submitBtn.disabled = true;
        if (statusEl) statusEl.textContent = "Submitting...";

        try {
          await setDoc(
            doc(db, "laneSubmissions", athleteId),
            {
              [SESSION_KEY]: {
                body,
                ...payload,
                submittedAt: serverTimestamp(),
                status: "pending",
                lane: ACTIVE_LANE,
                segmentId: ACTIVE_SEGMENT_ID,
                sessionN: Number(sessionN),
                athleteUid: athleteId,
                athleteName: athlete.fullName || "",
              },
            },
            { merge: true }
          );

          [
            "strength-explosive",
            "strength-main",
            "strength-secondary",
            "strength-assistance",
            "strength-conditioning",
          ].forEach((id) => {
            const el = document.getElementById(id);
            if (el) el.disabled = true;
          });

          if (session.track?.baseline?.fields) {
            session.track.baseline.fields.forEach((f) => {
              const el = document.getElementById(`baseline-${f.key}`);
              if (el) el.disabled = true;
            });
          }

          submitBtn.textContent = "Submitted";
          if (statusEl) statusEl.textContent = "Submitted. Awaiting coach review.";

          goToHub();
        } catch (err) {
          console.error("Strength submit error:", err);
          if (statusEl) statusEl.textContent = "Error submitting (see console).";
          submitBtn.disabled = false;
        }
      });
    }
  } catch (err) {
    console.error("Strength lane error:", err);
    container.innerHTML = `<div style="opacity:.6;">Error loading Strength session.</div>`;
  }
}

loadStrengthSession();