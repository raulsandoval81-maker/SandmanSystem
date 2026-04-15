import {
  db,
  ensureSignedIn,
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
} from "/assets/js/firebase-init.js";

await ensureSignedIn();

const container = document.getElementById("lane-root");
const params = new URLSearchParams(window.location.search);
const athleteId = (params.get("id") || "").trim().toUpperCase();

const ACTIVE_LANE = "conditioning";
const ACTIVE_TRACK = "f4";
const ACTIVE_SEGMENT_ID = "segment1";
const VAULT_PATH = "/vault/conditioning/f4/segment1/sessions.json";
const PRESETS_PATH = "/vault/strength/remote-hiit/presets.json";

function esc(str = "") {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function fatalMissingId() {
  document.body.innerHTML = `
    <main style="max-width:900px;margin:40px auto;padding:16px;font-family:system-ui;color:#e8eef7">
      <h1 style="color:#ffd633;margin:0 0 10px">Missing athlete id</h1>
      <p style="margin:0 0 14px;color:#9ca3af">This page needs <code>?id=F4_0001</code>.</p>
    </main>
  `;
  throw new Error("Missing athlete id");
}

function isFoundry4(id = "") {
  return /^F4[_-]/i.test(id);
}

async function fetchJson(url) {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`Fetch failed: ${res.status} ${res.statusText} @ ${url}`);
  }
  return res.json();
}

function getCompletedConditioningSubmissions(submissionsObj = {}) {
  return Object.values(submissionsObj)
    .filter((row) => {
      const lane = String(row?.lane || "").toLowerCase();
      const track = String(row?.track || "").toLowerCase();
      const status = String(row?.status || "").toLowerCase();
      return (
        lane === ACTIVE_LANE &&
        track === ACTIVE_TRACK &&
        (status === "closed" || status === "approved")
      );
    })
    .sort((a, b) => Number(b.sessionN || 0) - Number(a.sessionN || 0));
}

function buildCombinedBody(questions = []) {
  const answerEls = Array.from(document.querySelectorAll(".cond-answer"));
  if (!answerEls.length) return "";

  return answerEls
    .map((el, idx) => {
      const q = questions[idx] || `Question ${idx + 1}`;
      const value = String(el.value || "").trim();
      return value ? `Q${idx + 1}: ${q}\nA: ${value}` : "";
    })
    .filter(Boolean)
    .join("\n\n");
}

function normalizeAssignedSession({ assignment, preset }) {
  if (!assignment || !preset) return null;

  const levelMap = {
    NOVICE: { workSec: 30, restSec: 30, rounds: 3, movesPerCycle: 4 },
    BEGINNER: { workSec: 40, restSec: 20, rounds: 3, movesPerCycle: 5 },
    INTERMEDIATE: { workSec: 45, restSec: 15, rounds: 4, movesPerCycle: 6 },
    ADVANCED: { workSec: 50, restSec: 10, rounds: 5, movesPerCycle: 7 },
    ELITE: { workSec: 60, restSec: 0, rounds: 6, movesPerCycle: 8 },
  };

  const defaults = levelMap[String(preset.levelId || "").trim().toUpperCase()] || {};

  return {
    n: Number(assignment?.sourceSessionN || 1),
    title: preset.label || "Assigned Conditioning",
    level: String(preset.levelId || "").trim().toUpperCase(),
    interval: {
      workSec: Number(defaults.workSec || 40),
      restSec: Number(defaults.restSec || 20),
    },
    rounds: Number(preset.rounds || defaults.rounds || 3),
    movesPerCycle: Number(
      Array.isArray(preset.movements) ? preset.movements.length : (defaults.movesPerCycle || 0)
    ),
    sequence: Array.isArray(preset.movements) ? preset.movements : [],
    prompt: assignment?.note || preset.notes || "Complete the assigned conditioning workout.",
    questions: [
      "Did you complete all assigned rounds?",
      "What was the hardest movement?",
    ],
    assigned: true,
    assignedPresetId: preset.id || "",
    sourceSessionN: Number(assignment?.sourceSessionN || 1),
  };
}

async function loadConditioningSession() {
  if (!container) return;
  if (!athleteId) fatalMissingId();

  if (!isFoundry4(athleteId)) {
    container.innerHTML = `
      <div class="lane-card">
        This page is for Foundry 4 athletes only.
      </div>
    `;
    return;
  }

  try {
    const athleteSnap = await getDoc(doc(db, "athletes", athleteId));

    const backBtn = document.getElementById("backBtn");

backBtn?.addEventListener("click", () => {
  window.location.href = `/athletes/hub/?id=${athleteId}`;
});


    if (!athleteSnap.exists()) {
      container.innerHTML = `<div class="lane-card">Athlete not found.</div>`;
      return;
    }

    const athlete = athleteSnap.data() || {};

    const [vaultData, presetsData, subSnap] = await Promise.all([
      fetchJson(VAULT_PATH),
      fetchJson(PRESETS_PATH).catch(() => ({ presets: [] })),
      getDoc(doc(db, "laneSubmissions", athleteId)),
    ]);

    const sessions = Array.isArray(vaultData?.sessions) ? vaultData.sessions : [];
    const submissions = subSnap.exists() ? subSnap.data() || {} : {};

    const assignment = submissions?.conditioning_assignment || null;
    const assignmentStatus = String(assignment?.status || "").toLowerCase();
    const assignedPresetId = String(assignment?.presetId || "").trim();

    const presets = Array.isArray(presetsData?.presets) ? presetsData.presets : [];
    const assignedPreset =
      assignmentStatus === "assigned" && assignedPresetId
        ? presets.find((p) => String(p?.id || "").trim() === assignedPresetId) || null
        : null;

    let session = null;
    let sessionN = 1;
    let sessionKey = "";

    if (assignmentStatus === "assigned" && assignedPreset) {
      session = normalizeAssignedSession({ assignment, preset: assignedPreset });
      sessionN = Number(session?.n || assignment?.sourceSessionN || 1);
      sessionKey = `conditioning_${ACTIVE_TRACK}_${ACTIVE_SEGMENT_ID}_session${sessionN}`;
    } else {
      if (!sessions.length) {
        container.innerHTML = `<div class="lane-card">No conditioning session found.</div>`;
        return;
      }

      const completed = getCompletedConditioningSubmissions(submissions);
      const nextSessionN = completed.length ? Number(completed[0].sessionN) + 1 : 1;

      session =
        sessions.find((s) => Number(s?.n) === nextSessionN) ||
        sessions.find((s) => Number(s?.n) === 1) ||
        null;

      if (!session) {
        container.innerHTML = `<div class="lane-card">No session found.</div>`;
        return;
      }

      sessionN = Number(session?.n || 1);
      sessionKey = `conditioning_${ACTIVE_TRACK}_${ACTIVE_SEGMENT_ID}_session${sessionN}`;
    }

    const existing = submissions?.[sessionKey] || null;
    const existingBody = String(existing?.body || "").trim();
    const statusValue = String(existing?.status || "").trim().toLowerCase();

    const isRevision = statusValue === "needs_revision";
    const isPending = statusValue === "pending";
    const isApproved = statusValue === "approved" || statusValue === "closed";
    const isEditable = !existing || isRevision;

    const questions = Array.isArray(session?.questions) ? session.questions : [];
    const sequence = Array.isArray(session?.sequence) ? session.sequence : [];

    container.innerHTML = `
      <div class="lane-card">
        <div style="font-weight:900;font-size:1.1rem;">
          ${esc(session.title || `Conditioning Session ${sessionN}`)}
        </div>

        <div style="margin-top:.35rem;opacity:.72;font-size:.92rem;">
          F4 Conditioning · Session ${esc(String(sessionN))}
          ${session?.assigned ? ` · Assigned Support` : ""}
        </div>

        ${
          session?.assigned
            ? `
              <div style="margin-top:.6rem;padding:.7rem .85rem;border:1px solid #27304a;border-radius:10px;background:#0b1017;">
                <div style="font-weight:900;color:#ffd633;">Remote Workout Assigned</div>
                <div style="margin-top:.25rem;opacity:.82;font-size:.92rem;">
                  This is optional support only. Your iron day still needs to be made up.
                </div>
              </div>
            `
            : ""
        }

        <div style="margin-top:.7rem;padding:.9rem;border:1px solid #1f2937;border-radius:12px;background:#0b1017;">
          <div style="font-weight:900;margin-bottom:.35rem;">Session Plan</div>

          <div style="opacity:.8;margin-bottom:.6rem;">
            <b>Level:</b> ${esc(session.level || "")}
            &nbsp;•&nbsp;
            <b>Interval:</b> ${esc(String(session?.interval?.workSec || "?"))}/${esc(String(session?.interval?.restSec || "?"))}
            &nbsp;•&nbsp;
            <b>Rounds:</b> ${esc(String(session.rounds || ""))}
            &nbsp;•&nbsp;
            <b>Moves:</b> ${esc(String(session.movesPerCycle || sequence.length || ""))}
          </div>

          ${
            sequence.length
              ? `
              <div style="margin-top:.6rem;">
                <div style="font-weight:900;font-size:.95rem;margin-top:.5rem;">Sequence</div>
                <ul style="margin:.5rem 0 0 1.1rem;padding:0;line-height:1.5;">
                  ${sequence.map((move) => `<li>${esc(move)}</li>`).join("")}
                </ul>
              </div>
              `
              : ""
          }

          ${
            session.prompt
              ? `
              <div style="margin-top:.8rem;opacity:.85;">
                <div style="font-weight:800;margin-bottom:.25rem;">Prompt</div>
                <div>${esc(session.prompt)}</div>
              </div>
              `
              : ""
          }
        </div>
      </div>

      <div class="lane-card" style="margin-top:14px;">
        <div style="font-weight:900;margin-bottom:.4rem;">Respond</div>

        ${
          questions.length
            ? questions.map((q, i) => `
              <div style="margin-top:${i === 0 ? ".2rem" : ".75rem"};">
                <div style="font-weight:700;">${i + 1}. ${esc(q)}</div>
                <textarea
                  class="cond-answer"
                  data-q="${i + 1}"
                  placeholder="Your response..."
                  style="width:100%;min-height:80px;margin-top:.25rem;padding:.65rem;border-radius:8px;border:1px solid #1f2937;background:#0b1017;color:#e8eef7;"
                  ${!isEditable ? "disabled" : ""}
                ></textarea>
              </div>
            `).join("")
            : `
              <textarea
                id="conditioning-response"
                placeholder="Write your response here..."
                style="width:100%;min-height:110px;padding:.75rem;border-radius:8px;border:1px solid #1f2937;background:#0b1017;color:#e8eef7;"
                ${!isEditable ? "disabled" : ""}
              >${esc(existingBody)}</textarea>
            `
        }

        ${
          isRevision && existing?.coachNote
            ? `
            <div style="margin-top:.5rem;color:#ffcc00;">
              Coach: ${esc(existing.coachNote)}
            </div>
            `
            : ""
        }

        <button
          id="conditioning-submit"
          style="margin-top:.75rem;padding:.6rem 1rem;background:#ffd633;color:#000;font-weight:800;border:none;border-radius:8px;cursor:pointer;"
          ${!isEditable ? "disabled" : ""}
        >
          ${isRevision ? "Resubmit" : isPending ? "Submitted" : isApproved ? "Approved" : "Submit"}
        </button>

        <div id="conditioning-status" style="margin-top:.5rem;font-size:.9rem;opacity:.7;">
          ${
            isRevision
              ? "Revision requested. Update and resubmit."
              : isPending
                ? "Submitted. Awaiting coach review."
                : isApproved
                  ? "Approved."
                  : ""
          }
        </div>
      </div>
    `;

    if (questions.length && existingBody) {
      const chunks = String(existingBody)
        .split(/\n\s*\n/)
        .map((x) => x.trim())
        .filter(Boolean);

      const answerEls = document.querySelectorAll(".cond-answer");
      answerEls.forEach((el, idx) => {
        const raw = chunks[idx] || "";
        const cleaned = raw
          .replace(/^Q\d+:\s*/i, "")
          .replace(/^A:\s*/i, "")
          .trim();
        el.value = cleaned;
      });
    }

    if (!isEditable) return;

    const submitBtn = document.getElementById("conditioning-submit");
    const statusEl = document.getElementById("conditioning-status");

    submitBtn?.addEventListener("click", async () => {
      let body = "";

      if (questions.length) {
        body = buildCombinedBody(questions);
      } else {
        body = (document.getElementById("conditioning-response")?.value || "").trim();
      }

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
            [sessionKey]: {
              body,
              submittedAt: serverTimestamp(),
              status: "pending",
              lane: ACTIVE_LANE,
              track: ACTIVE_TRACK,
              segmentId: ACTIVE_SEGMENT_ID,
              sessionN,
              athleteUid: athleteId,
              athleteName: athlete.fullName || athlete.athleteName || "",
              title: session.title || "",
              level: session.level || "",
              interval: session.interval || null,
              rounds: Number(session.rounds || 0),
              movesPerCycle: Number(session.movesPerCycle || sequence.length || 0),
              sequence,
            },
            ...(session?.assigned
              ? {
                  "conditioning_assignment.status": "completed",
                  "conditioning_assignment.completedAt": serverTimestamp(),
                }
              : {}),
          },
          { merge: true }
        );

        const answerEls = document.querySelectorAll(".cond-answer");
        if (answerEls.length) {
          answerEls.forEach((el) => {
            el.disabled = true;
          });
        } else {
          const ta = document.getElementById("conditioning-response");
          if (ta) ta.disabled = true;
        }

        submitBtn.textContent = "Submitted";
        if (statusEl) statusEl.textContent = "Submitted. Awaiting coach review.";
      } catch (err) {
        console.error("F4 conditioning submit error:", err);
        if (statusEl) statusEl.textContent = "Error submitting (see console).";
        submitBtn.disabled = false;
      }
    });
  } catch (err) {
    console.error("F4 conditioning load error:", err);
    container.innerHTML = `<div class="lane-card">Error loading conditioning session.</div>`;
  }
}

loadConditioningSession();