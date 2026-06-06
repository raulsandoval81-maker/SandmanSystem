// /public/athletes/arsenal/strength/preseason/session/session.js

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

const ACTIVE_LANE = "strength";
const ACTIVE_SEGMENT_ID = (params.get("segment") || "segment1").trim().toLowerCase();
const ACTIVE_PHASE = "preseason";

let sessionN = 1;

async function resolveAssignedSession(laneName, fallback = 1) {
  const forced = Number(params.get("session") || params.get("n") || 0);
  if (forced >= 1) return forced;

  try {
    const assignRef = doc(db, "system", "laneAssignments");
    const assignSnap = await getDoc(assignRef);

    if (!assignSnap.exists()) return fallback;

    const data = assignSnap.data() || {};
    const session = Number(data?.[laneName]?.session || 0);

    return session >= 1 ? session : fallback;
  } catch (err) {
    console.warn(`Assignment read failed for ${laneName}:`, err);
    return fallback;
  }
}

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
        <code style="color:#cbd5e1">/athletes/arsenal/strength/preseason/session/?id=F4_0010</code>
      </div>
    </main>
  `;
  throw new Error("Missing athlete id (query param ?id=...)");
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

function buildGeneratedStrengthSession(n, explosiveLib, workoutA, workoutB, hiitPreset) {
  const rotation = n % 2 === 0 ? "A" : "B";
  const iron = rotation === "A" ? workoutA : workoutB;

  const explosivePool = Array.isArray(explosiveLib?.explosive) ? explosiveLib.explosive : [];
  const explosive = explosivePool.length ? explosivePool[(n - 2) % explosivePool.length] : null;

  const levelOrder = ["NOVICE", "BEGINNER", "INTERMEDIATE", "ADVANCED", "ELITE"];
  const levels = Array.isArray(hiitPreset?.levels) ? hiitPreset.levels : [];
  const safeLevelCount = Math.max(1, Math.min(levelOrder.length, levels.length || levelOrder.length));
  const hiitLevelId = levelOrder[(n - 2) % safeLevelCount];
  const hiitLevel = levels.find((x) => String(x.id) === hiitLevelId) || null;

  const seasonBlock = iron?.seasonBlocks?.[ACTIVE_PHASE] || null;

  return {
    n,
    id: `STR-${String(n).padStart(3, "0")}`,
    type: "training",
    rotation,
    title: `Preseason Session ${rotation}`,
    prompt:
      rotation === "A"
        ? "Complete today’s preseason strength session: build base, move clean, then log your best working set or best HIIT round."
        : "Complete today’s preseason strength session: build base, stay disciplined, then log your best working set or best HIIT round.",
    deliverable:
      "Submit your best working set or best HIIT round, plus a short note on effort and form.",
    coachNote:
      rotation === "A"
        ? "Preseason is about building rhythm. Keep reps clean."
        : "Preseason is about building the base. Stay honest.",
    generated: {
      phase: ACTIVE_PHASE,
      explosive,
      iron,
      seasonBlock,
      hiitLevel,
    },
  };
}

function renderGeneratedBlock(session) {
  const g = session?.generated;
  if (!g) return "";

  const explosive = g.explosive;
  const iron = g.iron;
  const seasonBlock = g.seasonBlock;
  const hiitLevel = g.hiitLevel;

  return `
    <div style="margin-top:1rem;padding:.9rem;border:1px solid #1f2937;border-radius:12px;background:#0b1017;">
      <div style="font-weight:900;margin-bottom:.35rem;">Generated Session Plan</div>
      <div style="opacity:.78;font-size:.95rem;margin-bottom:.5rem;">
        Phase: ${esc(g.phase || ACTIVE_PHASE)} • Rotation: ${esc(session.rotation || "")}
      </div>

      ${
        explosive
          ? `
          <div style="margin-top:.7rem;">
            <div style="font-weight:800;">Explosive</div>
            ${renderExerciseList([explosive])}
          </div>
        `
          : ""
      }

      ${
        iron
          ? `
          <div style="margin-top:.7rem;">
            <div style="font-weight:800;">Iron Work — ${esc(iron.label || `Workout ${session.rotation}`)}</div>
            <div style="opacity:.8;margin-top:.25rem;">${esc(iron.tagline || "")}</div>
          </div>
        `
          : ""
      }

      ${
        seasonBlock?.mainLift?.length
          ? `
          <div style="margin-top:.7rem;">
            <div style="font-weight:800;">Main Lift</div>
            ${renderExerciseList(seasonBlock.mainLift)}
          </div>
        `
          : ""
      }

      ${
        seasonBlock?.secondaryLift?.length
          ? `
          <div style="margin-top:.7rem;">
            <div style="font-weight:800;">Secondary Lift</div>
            ${renderExerciseList(seasonBlock.secondaryLift)}
          </div>
        `
          : ""
      }

      ${
        seasonBlock?.assistance?.length
          ? `
          <div style="margin-top:.7rem;">
            <div style="font-weight:800;">Assistance</div>
            ${renderExerciseList(seasonBlock.assistance)}
          </div>
        `
          : ""
      }

      ${
        seasonBlock?.conditioning?.options?.length
          ? `
          <div style="margin-top:.7rem;">
            <div style="font-weight:800;">Conditioning Finish</div>
            ${renderList(seasonBlock.conditioning.options)}
          </div>
        `
          : ""
      }

      ${
        hiitLevel
          ? `
          <div style="margin-top:.7rem;">
            <div style="font-weight:800;">Remote HIIT Option</div>
            <div style="margin-top:.25rem;">
              ${esc(hiitLevel.label)} — ${esc(String(hiitLevel.interval?.workSec || "?"))}/${esc(
                String(hiitLevel.interval?.restSec || "?")
              )}
              • ${esc(String(hiitLevel.periods || "?"))} periods
              • ${esc(String(hiitLevel.periodMinutes || "?"))} min each
            </div>
            <div style="opacity:.75;margin-top:.2rem;">${esc(hiitLevel.notes || "")}</div>
          </div>
        `
          : ""
      }
    </div>
  `;
}

async function loadStrengthSession() {
  if (!container) return;
  if (!athleteId) fatalMissingId();

  sessionN = await resolveAssignedSession(ACTIVE_LANE, 1);
 
  const backLink = document.querySelector("a.btn-back");
  if (backLink) {
    backLink.href = `/athletes/arsenal/strength/preseason.html?id=${encodeURIComponent(athleteId)}`;
  }

  try {
    const [athleteSnap, sessionData, explosiveLib, hiitPreset, workoutA, workoutB] = await Promise.all([
      getDoc(doc(db, "athletes", athleteId)),
      fetchJson(`/vault/${ACTIVE_LANE}/${ACTIVE_SEGMENT_ID}/sessions.json`),
      fetchJson("/vault/strength/explosive/library.json").catch(() => null),
      fetchJson("/vault/strength/remote-hiit/presets.json").catch(() => null),
      fetchJson("/vault/strength/iron/workoutA.json").catch(() => null),
      fetchJson("/vault/strength/iron/workoutB.json").catch(() => null),
    ]);

    if (!athleteSnap.exists()) {
      container.innerHTML = `<div style="opacity:.7;">Athlete profile not found for <code>${esc(athleteId)}</code>.</div>`;
      return;
    }

    const athlete = athleteSnap.data() || {};
    const stripe = Number(athlete.stripeCount ?? athlete.stripesEarned ?? 0);
    const age = Number(athlete.age ?? 0);
    const ironAllowed = age >= 13;


const tierRaw =
  athlete.tier ??
  athlete.tierCode ??
  athlete.currentTier ??
  "T0";

const tierMatch = String(tierRaw).match(/T(\d+)/i);
const tierNum = tierMatch ? Number(tierMatch[1]) : 0;

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
} else if (stripe < 1) {
  container.innerHTML = `
    <div class="lane-card">
      Earn Stripe 1 to unlock Strength.
    </div>
  `;
  return;
}


    const vaultSessions = Array.isArray(sessionData) ? sessionData : sessionData.sessions || [];
    let session = vaultSessions.find((s) => Number(s?.n) === Number(sessionN)) || null;

    if (!session && sessionN >= 2 && sessionN <= 39) {
      session = buildGeneratedStrengthSession(sessionN, explosiveLib, workoutA, workoutB, hiitPreset);
    }

    if (!session) {
      container.innerHTML = `<div style="opacity:.6;">Preseason Session ${esc(sessionN)} not found in vault.</div>`;
      return;
    }

    let subDoc = {};
    try {
      const subSnap = await getDoc(doc(db, "laneSubmissions", athleteId));
      if (subSnap.exists()) subDoc = subSnap.data() || {};
    } catch (e) {
      console.warn("Could not read laneSubmissions:", e);
    }

    const SESSION_KEY = String(session.id || `STR-${String(sessionN).padStart(3, "0")}`);
    const existing = subDoc?.[SESSION_KEY] || null;
    const existingBody = (existing?.body || "").trim();
    const status = existing?.status || "new";

const isEditable = status === "new" || status === "needs_revision";
const isPending = status === "pending";
const isApproved = status === "approved";
const isRevision = status === "needs_revision";
    const isBaseline = session.type === "baseline_test" || Number(sessionN) === 1;

    const existingRemote = subDoc?.strength_remote_hiit || null;
    const existingIron = subDoc?.strength_iron_latest || null;
    const lastIronNote = String(subDoc?.strength_iron_lastNote || "");

    container.innerHTML = `
      <div class="lane-card">
        <div style="font-weight:900; font-size:1.1rem;">
          ${esc(session.title || `Preseason Session ${sessionN}`)}
        </div>

        <div style="margin-top:.35rem; opacity:.72; font-size:.92rem;">
          ${esc(ACTIVE_SEGMENT_ID)} · Session ${esc(sessionN)}
          ${session.type ? ` • Type: ${esc(session.type)}` : ""}
          ${session.rotation ? ` • Rotation: ${esc(session.rotation)}` : ""}
        </div>

        <div style="margin-top:.6rem; white-space:pre-wrap; line-height:1.5;">
          ${esc(session.prompt || session.body || "")}
        </div>

        ${
          session.workout?.length
            ? `
            <div style="margin-top:.85rem;">
              <div style="font-weight:800;">
                ${session.type === "baseline_test" ? "Baseline Test" : "Workout"}
              </div>
              ${renderList(session.workout)}
            </div>
          `
            : ""
        }

        ${
          session.deliverable
            ? `
            <div style="margin-top:.8rem; opacity:.85;">
              <div style="font-weight:800; margin-bottom:.25rem;">Deliverable</div>
              <div>${esc(session.deliverable)}</div>
            </div>
          `
            : ""
        }

        ${
          session.coachNote
            ? `
            <div style="margin-top:.8rem; opacity:.75;">
              <div style="font-weight:800; margin-bottom:.25rem;">Coach Note</div>
              <div>${esc(session.coachNote)}</div>
            </div>
          `
            : ""
        }

        ${renderGeneratedBlock(session)}

<div class="lane-card" style="margin-top:14px;">
  <div style="font-weight:900;margin-bottom:.4rem;">Log Your Work</div>

  <textarea
    id="strength-response"
    placeholder="Top set + note (example: Back Squat 205x6 — felt strong)"
    style="width:100%;min-height:110px;padding:.75rem;border-radius:8px;border:1px solid #1f2937;background:#0b1017;color:#e8eef7;"
    ${!isEditable ? "disabled" : ""}
  >${existingBody ? esc(existingBody) : ""}</textarea>

  ${isRevision && existing?.coachNote ? `
    <div style="margin-top:.5rem;color:#ffcc00;">
      Coach: ${esc(existing.coachNote)}
    </div>
  ` : ""}

  <button id="strength-submit" ...>
    ${isRevision ? "Resubmit" : isPending ? "Submitted" : "Submit"}
  </button>

  <div id="strength-status"...>
    ...
  </div>
</div>

        <button
          id="strength-submit"
          style="margin-top:.75rem;padding:.6rem 1rem;background:#ffd633;color:#000;font-weight:800;border:none;border-radius:8px;cursor:pointer;"
          ${isSubmitted ? "disabled" : ""}
        >
          ${isSubmitted ? "Submitted" : "Submit"}
        </button>

        <div id="strength-status" style="margin-top:.5rem;font-size:.9rem;opacity:.7;">
          ${isSubmitted ? "Submitted. Awaiting coach review." : ""}
        </div>
      </div>
    `;

    if (!isSubmitted) {
      const submitBtn = document.getElementById("strength-submit");
      const statusEl = document.getElementById("strength-status");

      submitBtn?.addEventListener("click", async () => {
        const body = (document.getElementById("strength-response")?.value || "").trim();

        if (!body) {
          if (statusEl) statusEl.textContent = "Response required.";
          return;
        }

        submitBtn.disabled = true;
        if (statusEl) statusEl.textContent = "Submitting...";

        try {
          await setDoc(
            doc(db, "laneSubmissions", athleteId),
            {
              [SESSION_KEY]: {
                body,
                submittedAt: serverTimestamp(),
                status: "pending",
                lane: ACTIVE_LANE,
                segmentId: ACTIVE_SEGMENT_ID,
                sessionN: Number(sessionN),
              },
            },
            { merge: true }
          );

          const ta = document.getElementById("strength-response");
          if (ta) ta.disabled = true;

          submitBtn.textContent = "Submitted";
          if (statusEl) statusEl.textContent = "Submitted. Awaiting coach review.";
        } catch (err) {
          console.error("Strength submit error:", err);
          if (statusEl) statusEl.textContent = "Error submitting (see console).";
          submitBtn.disabled = false;
        }
      });
    }

    if (!isBaseline) {
      const remoteLocked =
        !!(existingRemote?.submittedAt ||
        existingRemote?.status === "pending" ||
        existingRemote?.status === "approved");

      const levels = Array.isArray(hiitPreset?.levels) ? hiitPreset.levels : [];
      const resetSec = Number(hiitPreset?.resetBetweenPeriodsSec ?? 120);
      const allowedLevelIds = ["NOVICE", "BEGINNER", "INTERMEDIATE", "ADVANCED", "ELITE"];

      const levelOptionsHtml = levels
        .filter((l) => allowedLevelIds.includes(String(l.id)))
        .map((l) => {
          const w = Number(l?.interval?.workSec ?? 0);
          const r = Number(l?.interval?.restSec ?? 0);
          return `<option value="${esc(l.id)}">${esc(l.label)} — ${w}/${r}</option>`;
        })
        .join("");

      container.insertAdjacentHTML(
        "beforeend",
        `
        <div class="lane-card" style="margin-top:14px;">
          <details class="remote-accordion">
            <summary style="cursor:pointer;font-weight:900;font-size:1.05rem;">
              Remote Strength (Bodyweight HIIT)
            </summary>

            <div style="opacity:.75;margin-top:.5rem;line-height:1.35;">
              Period model • 2-minute reset between periods • +5 or +10 by coach review
            </div>

            <div style="margin-top:.8rem;display:grid;gap:.6rem;">
              <label style="display:grid;gap:.25rem;">
                <span style="opacity:.75;">Level</span>
                <select id="hiit-level" ${remoteLocked ? "disabled" : ""} style="padding:.55rem;border-radius:8px;border:1px solid #1f2937;background:#0b1017;color:#e8eef7;">
                  <option value="">Select level…</option>
                  ${levelOptionsHtml}
                </select>
              </label>

              <div id="hiit-details" style="opacity:.8;font-size:.95rem;"></div>

              <label style="display:grid;gap:.25rem;">
                <span style="opacity:.75;">Best Round (required)</span>
                <input id="hiit-bestRound" ${remoteLocked ? "disabled" : ""} value="${esc(existingRemote?.bestRound || existingRemote?.best || "")}"
                  placeholder="Example: Period 2, Round 3 — stayed sharp."
                  style="padding:.55rem;border-radius:8px;border:1px solid #1f2937;background:#0b1017;color:#e8eef7;"/>
              </label>

              <label style="display:grid;gap:.25rem;">
                <span style="opacity:.75;">Notes (optional)</span>
                <input id="hiit-notes" ${remoteLocked ? "disabled" : ""} value="${esc(existingRemote?.notes || "")}"
                  placeholder="One line max."
                  style="padding:.55rem;border-radius:8px;border:1px solid #1f2937;background:#0b1017;color:#e8eef7;"/>
              </label>
            </div>

            <button id="hiit-submit" ${remoteLocked ? "disabled" : ""} style="margin-top:.75rem;padding:.6rem 1rem;background:#ffd633;color:#000;font-weight:800;border:none;border-radius:8px;cursor:pointer;">
              ${remoteLocked ? "Submitted" : "Submit Remote HIIT"}
            </button>
            <div id="hiit-status" style="margin-top:.5rem;font-size:.9rem;opacity:.7;">
              ${remoteLocked ? "Submitted. Awaiting coach review." : ""}
            </div>
          </details>
        </div>
        `
      );

      const hiitLevelEl = document.getElementById("hiit-level");
      const hiitDetails = document.getElementById("hiit-details");
      const hiitBestEl = document.getElementById("hiit-bestRound");
      const hiitNotesEl = document.getElementById("hiit-notes");
      const hiitBtn = document.getElementById("hiit-submit");
      const hiitStatus = document.getElementById("hiit-status");

      function calcRemoteDetails(levelId) {
        const lvl = levels.find((x) => String(x.id) === String(levelId));
        if (!lvl) return "";
        const work = Number(lvl?.interval?.workSec ?? 0);
        const rest = Number(lvl?.interval?.restSec ?? 0);
        const mins = Number(lvl?.periodMinutes ?? 0);
        const moves = Number(lvl?.movesPerPeriod ?? 0);
        const periods = Number(lvl?.periods ?? 0);

        return `
          <div><b>Period:</b> ${mins} min • <b>Moves:</b> ${moves} • <b>Periods:</b> ${periods}</div>
          <div><b>Interval:</b> ${work}s on / ${rest}s off • <b>Reset:</b> ${Math.round(resetSec / 60)} min</div>
          <div style="opacity:.75;"><b>Note:</b> ${esc(lvl?.notes || "")}</div>
        `;
      }

      if (hiitLevelEl && hiitDetails) {
        const existingLevel = existingRemote?.levelId || "";
        if (existingLevel) hiitLevelEl.value = existingLevel;
        hiitDetails.innerHTML = calcRemoteDetails(hiitLevelEl.value);

        hiitLevelEl.addEventListener("change", () => {
          hiitDetails.innerHTML = calcRemoteDetails(hiitLevelEl.value);
        });
      }

      if (!remoteLocked) {
        hiitBtn?.addEventListener("click", async () => {
          const levelId = (hiitLevelEl?.value || "").trim();
          const bestRound = (hiitBestEl?.value || "").trim();
          const notes = (hiitNotesEl?.value || "").trim();

          if (!levelId) {
            if (hiitStatus) hiitStatus.textContent = "Select a level.";
            return;
          }
          if (!bestRound) {
            if (hiitStatus) hiitStatus.textContent = "Best Round required.";
            return;
          }

          hiitBtn.disabled = true;
          if (hiitStatus) hiitStatus.textContent = "Submitting...";

          try {
            const lvl = levels.find((x) => String(x.id) === String(levelId));
            await setDoc(
              doc(db, "laneSubmissions", athleteId),
              {
                strength_remote_hiit: {
                  levelId,
                  levelLabel: lvl?.label || levelId,
                  interval: lvl?.interval || null,
                  periodMinutes: Number(lvl?.periodMinutes ?? 0),
                  movesPerPeriod: Number(lvl?.movesPerPeriod ?? 0),
                  periods: Number(lvl?.periods ?? 0),
                  resetBetweenPeriodsSec: resetSec,
                  bestRound,
                  notes,
                  submittedAt: serverTimestamp(),
                  status: "pending",
                  lane: ACTIVE_LANE,
                  kind: "remote_hiit",
                },
              },
              { merge: true }
            );

            if (hiitLevelEl) hiitLevelEl.disabled = true;
            if (hiitBestEl) hiitBestEl.disabled = true;
            if (hiitNotesEl) hiitNotesEl.disabled = true;
            hiitBtn.textContent = "Submitted";
            if (hiitStatus) hiitStatus.textContent = "Submitted. Awaiting coach review.";
          } catch (err) {
            console.error("Remote HIIT submit error:", err);
            if (hiitStatus) hiitStatus.textContent = "Error submitting (see console).";
            hiitBtn.disabled = false;
          }
        });
      }
    }

    if (!isBaseline) {
      if (!ironAllowed) {
        container.insertAdjacentHTML(
          "beforeend",
          `
          <div class="lane-card" style="margin-top:14px;opacity:.8;">
            <div style="font-weight:900;font-size:1.05rem;">Iron Room</div>
            <div style="margin-top:.35rem;">Iron Room unlocks at age 13.</div>
          </div>
          `
        );
        return;
      }

      const phases = ["preseason", "inseason", "postseason"];

      container.insertAdjacentHTML(
        "beforeend",
        `
        <div class="lane-card" style="margin-top:14px;">
          <div style="font-weight:900;font-size:1.05rem;">Iron Room (Execution Log)</div>
          <div style="opacity:.75;margin-top:.35rem;line-height:1.35;">
            Log the day you ran. Top set + completion + note. This is execution discipline, not spreadsheet tracking.
          </div>

          ${
            lastIronNote
              ? `
            <div style="margin-top:.7rem;padding:.6rem;border-radius:10px;border:1px solid #1f2937;background:#0b1017;">
              <div style="font-weight:800;margin-bottom:.25rem;opacity:.85;">Last Iron Note</div>
              <div style="opacity:.8;white-space:pre-wrap;">${esc(lastIronNote)}</div>
            </div>
          `
              : ""
          }

          <div style="margin-top:.9rem;display:grid;gap:.6rem;">
            <label style="display:grid;gap:.25rem;">
              <span style="opacity:.75;">Phase</span>
              <select id="iron-phase" style="padding:.55rem;border-radius:8px;border:1px solid #1f2937;background:#0b1017;color:#e8eef7;">
                ${phases.map((p) => `<option value="${esc(p)}">${esc(p)}</option>`).join("")}
              </select>
            </label>

            <label style="display:grid;gap:.25rem;">
              <span style="opacity:.75;">Day (1–3)</span>
              <select id="iron-day" style="padding:.55rem;border-radius:8px;border:1px solid #1f2937;background:#0b1017;color:#e8eef7;">
                <option value="1">Day 1</option>
                <option value="2">Day 2</option>
                <option value="3">Day 3</option>
              </select>
            </label>

            <label style="display:grid;gap:.25rem;">
              <span style="opacity:.75;">Top Movement</span>
              <input id="iron-move" value="${esc(existingIron?.topMovement || "")}"
                placeholder="Example: Back Squat"
                style="padding:.55rem;border-radius:8px;border:1px solid #1f2937;background:#0b1017;color:#e8eef7;"/>
            </label>

            <div style="display:grid;grid-template-columns:1fr 1fr;gap:.6rem;">
              <label style="display:grid;gap:.25rem;">
                <span style="opacity:.75;">Sets Completed</span>
                <input id="iron-sets" inputmode="numeric" value="${esc(existingIron?.setsCompleted ?? "")}"
                  placeholder="3"
                  style="padding:.55rem;border-radius:8px;border:1px solid #1f2937;background:#0b1017;color:#e8eef7;"/>
              </label>
              <label style="display:grid;gap:.25rem;">
                <span style="opacity:.75;">Reps Completed</span>
                <input id="iron-reps" inputmode="numeric" value="${esc(existingIron?.repsCompleted ?? "")}"
                  placeholder="10"
                  style="padding:.55rem;border-radius:8px;border:1px solid #1f2937;background:#0b1017;color:#e8eef7;"/>
              </label>
            </div>

            <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:.6rem;">
              <label style="display:grid;gap:.25rem;">
                <span style="opacity:.75;">Top Set Reps</span>
                <input id="iron-topReps" inputmode="numeric" value="${esc(existingIron?.topSetReps ?? "")}"
                  placeholder="6"
                  style="padding:.55rem;border-radius:8px;border:1px solid #1f2937;background:#0b1017;color:#e8eef7;"/>
              </label>
              <label style="display:grid;gap:.25rem;">
                <span style="opacity:.75;">Top Set Weight</span>
                <input id="iron-topWt" inputmode="numeric" value="${esc(existingIron?.topSetWeight ?? "")}"
                  placeholder="100"
                  style="padding:.55rem;border-radius:8px;border:1px solid #1f2937;background:#0b1017;color:#e8eef7;"/>
              </label>
              <label style="display:grid;gap:.25rem;">
                <span style="opacity:.75;">Unit</span>
                <select id="iron-unit" style="padding:.55rem;border-radius:8px;border:1px solid #1f2937;background:#0b1017;color:#e8eef7;">
                  <option value="lb">lb</option>
                  <option value="kg">kg</option>
                </select>
              </label>
            </div>

            <label style="display:grid;gap:.25rem;">
              <span style="opacity:.75;">Completed Prescribed Work?</span>
              <select id="iron-complete" style="padding:.55rem;border-radius:8px;border:1px solid #1f2937;background:#0b1017;color:#e8eef7;">
                <option value="true">Yes</option>
                <option value="false">No</option>
              </select>
            </label>

            <label style="display:grid;gap:.25rem;">
              <span style="opacity:.75;">Note (1–2 sentences)</span>
              <input id="iron-note" value="${esc(existingIron?.note || "")}"
                placeholder="Example: Last rep slow, stayed tight."
                style="padding:.55rem;border-radius:8px;border:1px solid #1f2937;background:#0b1017;color:#e8eef7;"/>
            </label>
          </div>

          <button id="iron-submit" style="margin-top:.75rem;padding:.6rem 1rem;background:#ffd633;color:#000;font-weight:800;border:none;border-radius:8px;cursor:pointer;">
            Submit Iron Log
          </button>
          <div id="iron-status" style="margin-top:.5rem;font-size:.9rem;opacity:.7;"></div>
        </div>
        `
      );

      const ironPhase = document.getElementById("iron-phase");
      const ironDay = document.getElementById("iron-day");
      const ironMove = document.getElementById("iron-move");
      const ironSets = document.getElementById("iron-sets");
      const ironReps = document.getElementById("iron-reps");
      const ironTopReps = document.getElementById("iron-topReps");
      const ironTopWt = document.getElementById("iron-topWt");
      const ironUnit = document.getElementById("iron-unit");
      const ironComplete = document.getElementById("iron-complete");
      const ironNote = document.getElementById("iron-note");
      const ironBtn = document.getElementById("iron-submit");
      const ironStatus = document.getElementById("iron-status");

      if (existingIron?.phase && ironPhase) ironPhase.value = existingIron.phase;
      if (String(existingIron?.day || "") && ironDay) ironDay.value = String(existingIron.day);
      if (existingIron?.unit && ironUnit) ironUnit.value = existingIron.unit;
      if (typeof existingIron?.completedPrescribedWork === "boolean" && ironComplete) {
        ironComplete.value = existingIron.completedPrescribedWork ? "true" : "false";
      }

      ironBtn?.addEventListener("click", async () => {
        const phase = (ironPhase?.value || "").trim();
        const day = Number(ironDay?.value || 0);
        const topMovement = (ironMove?.value || "").trim();
        const setsCompleted = Number(ironSets?.value || 0);
        const repsCompleted = Number(ironReps?.value || 0);
        const topSetReps = Number(ironTopReps?.value || 0);
        const topSetWeight = Number(ironTopWt?.value || 0);
        const unit = (ironUnit?.value || "lb").trim();
        const completedPrescribedWork = (ironComplete?.value || "false") === "true";
        const note = (ironNote?.value || "").trim();

        if (!phase || !day || !topMovement || !setsCompleted || !repsCompleted || !topSetReps || !topSetWeight || !note) {
          if (ironStatus) ironStatus.textContent = "All fields required (note must be 1–2 sentences).";
          return;
        }

        ironBtn.disabled = true;
        if (ironStatus) ironStatus.textContent = "Submitting...";

        try {
          const payload = {
            phase,
            day,
            topMovement,
            setsCompleted,
            repsCompleted,
            topSetReps,
            topSetWeight,
            unit,
            completedPrescribedWork,
            note,
            submittedAt: serverTimestamp(),
            status: "pending",
            lane: ACTIVE_LANE,
            kind: "iron",
          };

          const now = new Date();
          const logKey =
            now.getFullYear() + "-" +
            String(now.getMonth() + 1).padStart(2, "0") + "-" +
            String(now.getDate()).padStart(2, "0") + "_" +
            String(now.getHours()).padStart(2, "0") +
            String(now.getMinutes()).padStart(2, "0");

          await setDoc(
            doc(db, "laneSubmissions", athleteId),
            {
              strength_iron_latest: payload,
              strength_iron_lastNote: note,
              strength_iron_logs: {
                [logKey]: payload,
              },
            },
            { merge: true }
          );

          [
            ironPhase, ironDay, ironMove, ironSets, ironReps,
            ironTopReps, ironTopWt, ironUnit, ironComplete, ironNote,
          ].forEach((el) => { if (el) el.disabled = true; });

          ironBtn.textContent = "Submitted";
          if (ironStatus) ironStatus.textContent = "Submitted. Awaiting coach review.";
        } catch (err) {
          console.error("Iron submit error:", err);
          if (ironStatus) ironStatus.textContent = "Error submitting (see console).";
          ironBtn.disabled = false;
        }
      });
    }
  } catch (err) {
    console.error("Preseason lane error:", err);
    container.innerHTML = `<div style="opacity:.6;">Error loading Preseason session.</div>`;
  }
}

loadStrengthSession();