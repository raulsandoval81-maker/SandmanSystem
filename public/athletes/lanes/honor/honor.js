// /public/athletes/lanes/honor/honor.js

import {
  db,
  ensureSignedIn,
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
} from "/assets/js/firebase-init.js";

import { getActiveVaultSession } from "/vault/vault.js";

await ensureSignedIn();

const ACTIVE_LANE = "honor";

const container = document.getElementById("honor-session-container");
const params = new URLSearchParams(location.search);
const athleteId = (params.get("id") || "").trim().toUpperCase();

const backLink = document.querySelector("a.btn-back");
if (backLink && athleteId) {
  backLink.href = `/athletes/hub/index.html?id=${encodeURIComponent(athleteId)}`;
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
    <main style="max-width:900px;margin:40px auto;padding:16px;">
      <h1 style="color:#ffd633;">Missing athlete id</h1>
      <p>This page needs ?id=F4_0010</p>
    </main>
  `;
  throw new Error("Missing athlete id");
}

function parseScripture(s) {
  if (!s) return { text: "", ref: "" };

  if (typeof s === "object") {
    return {
      text: s.text || "",
      ref: s.ref || "",
    };
  }

  const parts = String(s).split("—");
  return {
    text: parts[0]?.trim() || "",
    ref: parts[1]?.trim() || "",
  };
}

function getSessionNumber(session) {
  return Number(session?.sessionN ?? session?.n ?? 1);
}

function getCompletedHonorSubmissions(submissionsObj = {}) {
  return Object.values(submissionsObj)
    .filter((row) => {
      const lane = String(row?.lane || "").toLowerCase();
      const status = String(row?.status || "").toLowerCase();
      return lane === ACTIVE_LANE && (status === "closed" || status === "approved");
    })
    .sort((a, b) => Number(b.sessionN || 0) - Number(a.sessionN || 0));
}

function getSessionList(active) {
  if (Array.isArray(active?.sessions) && active.sessions.length) return active.sessions;
  if (Array.isArray(active?.segment?.sessions) && active.segment.sessions.length) return active.segment.sessions;
  if (Array.isArray(active?.data?.sessions) && active.data.sessions.length) return active.data.sessions;
  return [];
}
async function loadHonorSession() {
  if (!container) return;
  if (!athleteId) fatalMissingId();

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
        Honor unlocks at Competitor.
      </div>
    `;
    return;
  }

  if (stripe < 2) {
    container.innerHTML = `
      <div class="lane-card">
        Honor unlocks at Competitor Stripe 2.
      </div>
    `;
    return;
  }
}

  try {
    const athleteSnap = await getDoc(doc(db, "athletes", athleteId));
    if (!athleteSnap.exists()) {
      container.innerHTML = `Athlete not found`;
      return;
    }

    const athlete = athleteSnap.data() || {};
    const stripe = Number(athlete.stripeCount ?? athlete.stripesEarned ?? 0);

    if (stripe < 2) {
      container.innerHTML = `Honor unlocks at Stripe 2.`;
      return;
    }


const active = await getActiveVaultSession(ACTIVE_LANE);
console.log("HONOR ACTIVE", active);

const meta = active?.meta || {};
const segmentId = meta.segmentId || "segment1";

// Always load the FULL segment session list for athlete progression
const full = await fetch(`/vault/honor/${segmentId}/sessions.json`, {
  cache: "no-store"
}).then((r) => r.json());

let allSessions = Array.isArray(full)
  ? full
  : (Array.isArray(full?.sessions) ? full.sessions : []);

if (!allSessions.length) {
  const fallback = await fetch("/assets/data/honor/segment.json").then((r) => r.json());
  allSessions = fallback.sessions || [];
  console.log("HONOR FALLBACK SESSIONS LOADED", allSessions.length, allSessions);
}

if (!allSessions.length) {
  container.innerHTML = `No session found.`;
  return;
}

const subSnap = await getDoc(doc(db, "laneSubmissions", athleteId));
const submissions = subSnap.exists() ? subSnap.data() || {} : {};

const completed = getCompletedHonorSubmissions(submissions);
const nextSessionN = completed.length ? Number(completed[0].sessionN) + 1 : 1;

let session =
  allSessions.find((s) => getSessionNumber(s) === nextSessionN) ||
  allSessions.find((s) => getSessionNumber(s) === 1) ||
  null;

if (!session) {
  container.innerHTML = `No session found.`;
  return;
}
    const sessionN = getSessionNumber(session);
    const SESSION_KEY = session.id || `${ACTIVE_LANE}_${segmentId}_session${sessionN}`;

    const existing = submissions?.[SESSION_KEY] || null;
    const existingBody = (existing?.body || "").trim();
    const statusValue = String(existing?.status || "").trim().toLowerCase();

    const isRevision = statusValue === "needs_revision";
    const isPending = statusValue === "pending";
    const isApproved = statusValue === "approved" || statusValue === "closed";
    const isEditable = !existing || isRevision;

    const scripture = parseScripture(session.scripture);

container.innerHTML = `
  <div class="lane-card">

    <div style="font-weight:900;font-size:1.1rem;">
      ${esc(session.title || `Session ${sessionN}`)}
    </div>

    <div style="opacity:.7;font-size:.9rem;margin-bottom:10px;">
      ${esc(meta.segmentTitle || segmentId)} · Session ${sessionN}
    </div>

    <div class="session-block">
      ${
        session.focusArea
          ? `<div class="section-block">
               <div style="font-weight:800;">Focus Area</div>
               <div>${esc(session.focusArea)}</div>

               ${
                 String(sessionN) === "1"
                   ? `<div style="margin-top:.9rem;padding:.85rem;border:1px solid #1f2937;border-radius:10px;background:#0b1017;">
                        <div style="font-weight:800;margin-bottom:.55rem;">Rate Yourself (1–10)</div>
                        <div style="display:grid;grid-template-columns:repeat(2,minmax(140px,1fr));gap:.75rem;">
                          <label style="display:flex;flex-direction:column;gap:.35rem;font-weight:700;">
                            <span>Focus</span>
                            <input
                              type="number"
                              class="fear-rate"
                              data-rate="focus"
                              min="1"
                              max="10"
                              style="height:42px;padding:0 .75rem;border-radius:8px;border:1px solid #27304a;background:#111827;color:#e8eef7;"
                              ${!isEditable ? "disabled" : ""}
                            />
                          </label>

                          <label style="display:flex;flex-direction:column;gap:.35rem;font-weight:700;">
                            <span>Effort</span>
                            <input
                              type="number"
                              class="fear-rate"
                              data-rate="effort"
                              min="1"
                              max="10"
                              style="height:42px;padding:0 .75rem;border-radius:8px;border:1px solid #27304a;background:#111827;color:#e8eef7;"
                              ${!isEditable ? "disabled" : ""}
                            />
                          </label>

                          <label style="display:flex;flex-direction:column;gap:.35rem;font-weight:700;">
                            <span>Attitude</span>
                            <input
                              type="number"
                              class="fear-rate"
                              data-rate="attitude"
                              min="1"
                              max="10"
                              style="height:42px;padding:0 .75rem;border-radius:8px;border:1px solid #27304a;background:#111827;color:#e8eef7;"
                              ${!isEditable ? "disabled" : ""}
                            />
                          </label>

                          <label style="display:flex;flex-direction:column;gap:.35rem;font-weight:700;">
                            <span>Respect</span>
                            <input
                              type="number"
                              class="fear-rate"
                              data-rate="respect"
                              min="1"
                              max="10"
                              style="height:42px;padding:0 .75rem;border-radius:8px;border:1px solid #27304a;background:#111827;color:#e8eef7;"
                              ${!isEditable ? "disabled" : ""}
                            />
                          </label>
                        </div>
                      </div>`
                   : ""
               }
             </div>`
          : ""
      }

      ${
        session.principle
          ? `<div class="section-block" style="margin-top:.8rem;">
               <div style="font-weight:800;">Principle</div>
               <div style="white-space:pre-line;">${esc(session.principle)}</div>
             </div>`
          : ""
      }
    </div>

    ${
      session.houseStandard
        ? `<div class="session-block standard-block">
             <div style="font-weight:800;">House Standard</div>
             <div style="white-space:pre-line;">${esc(
               String(session.houseStandard)
                 .replace(/Say it out loud\.?\s*Twice\.?/gi, "(Say it out loud. Twice.)")
             )}</div>
           </div>`
        : ""
    }
          ${
        scripture.text
          ? `<div class="section-block" style="margin-top:.8rem; opacity:.75;">
               <div style="font-weight:800;">Scripture</div>
               <div style="font-style:italic;">${esc(scripture.text)}</div>
               ${
                 scripture.ref
                   ? `<div style="font-size:.8rem; opacity:.6;">${esc(scripture.ref)}</div>`
                   : ""
               }
             </div>`
          : ""
      }


    <div class="session-block">
      ${
        session.prompt
          ? `<div class="section-block">
               <div style="font-weight:800;">Prompt</div>
               <div style="white-space:pre-line;">${esc(session.prompt)}</div>
             </div>`
          : ""
      }


      ${
        Array.isArray(session.questions) && session.questions.length
          ? `
            <div class="section-block" style="margin-top:1rem;">
              <div style="font-weight:800;margin-bottom:.5rem;">Respond</div>
              <div style="display:grid;gap:.85rem;">
                ${session.questions.map((q, i) => `
                  <div style="padding:.75rem;border:1px solid #1f2937;border-radius:10px;background:#0b1017;">
                    <div style="font-weight:700;margin-bottom:.4rem;">${i + 1}. ${esc(q)}</div>
                    <textarea
                      class="honor-answer"
                      data-q="${i + 1}"
                      placeholder="Your response..."
                      style="width:100%;min-height:90px;padding:.65rem;border-radius:8px;border:1px solid #27304a;background:#111827;color:#e8eef7;"
                      ${!isEditable ? "disabled" : ""}
                    ></textarea>
                  </div>
                `).join("")}
              </div>

              ${
                isRevision && existing?.coachNote
                  ? `<div style="margin-top:.75rem;color:#ffcc00;font-size:.9rem;">
                       <b>Coach Feedback:</b><br/>
                       ${esc(existing.coachNote)}
                     </div>`
                  : ""
              }

              <button
                id="honor-submit"
                style="margin-top:.75rem;padding:.6rem 1rem;background:#ffd633;color:#000;font-weight:800;border:none;border-radius:8px;cursor:pointer;"
                ${!isEditable ? "disabled" : ""}
              >
                ${
                  isRevision
                    ? "Resubmit"
                    : isPending
                    ? "Submitted"
                    : isApproved
                    ? "Approved"
                    : "Submit"
                }
              </button>

              <div id="honor-status" style="margin-top:.5rem;font-size:.9rem;opacity:.7;">
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
          `
          : `
            <div class="section-block" style="margin-top:1rem;">
              <textarea
                id="honor-response"
                placeholder="Write your response here..."
                style="width:100%;min-height:140px;padding:.75rem;border-radius:8px;border:1px solid #1f2937;background:#0b1017;color:#e8eef7;"
                ${!isEditable ? "disabled" : ""}
              >${esc(existingBody)}</textarea>

              ${
                isRevision && existing?.coachNote
                  ? `<div style="margin-top:.75rem;color:#ffcc00;font-size:.9rem;">
                       <b>Coach Feedback:</b><br/>
                       ${esc(existing.coachNote)}
                     </div>`
                  : ""
              }

              <button
                id="honor-submit"
                style="margin-top:.75rem;padding:.6rem 1rem;background:#ffd633;color:#000;font-weight:800;border:none;border-radius:8px;cursor:pointer;"
                ${!isEditable ? "disabled" : ""}
              >
                ${
                  isRevision
                    ? "Resubmit"
                    : isPending
                    ? "Submitted"
                    : isApproved
                    ? "Approved"
                    : "Submit"
                }
              </button>

              <div id="honor-status" style="margin-top:.5rem;font-size:.9rem;opacity:.7;">
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
          `
      }
    </div>
  </div>
`;
    if (Array.isArray(session.questions) && session.questions.length && existingBody) {
      const chunks = String(existingBody)
        .split(/\n\s*\n/)
        .map((x) => x.trim())
        .filter(Boolean);

      const answerEls = document.querySelectorAll(".honor-answer");
      answerEls.forEach((el, idx) => {
        const raw = chunks[idx] || "";
        const cleaned = raw.replace(/^Q\d+:\s*/i, "").trim();
        el.value = cleaned;
      });
    }

    if (!isEditable) return;

    const btn = document.getElementById("honor-submit");
    const status = document.getElementById("honor-status");
    const singleResponseEl = document.getElementById("honor-response");

    btn.onclick = async () => {
      let body = "";

      const answerEls = Array.from(document.querySelectorAll(".honor-answer"));
      if (answerEls.length) {
        body = answerEls
          .map((el, idx) => {
            const value = String(el.value || "").trim();
            return value ? `Q${idx + 1}: ${value}` : "";
          })
          .filter(Boolean)
          .join("\n\n");
      } else {
        body = singleResponseEl?.value.trim() || "";
      }

      if (!body) {
        status.textContent = "Response required.";
        return;
      }

      btn.disabled = true;
      status.textContent = "Submitting...";

      try {
        await setDoc(
          doc(db, "laneSubmissions", athleteId),
          {
            [SESSION_KEY]: {
              body,
              submittedAt: serverTimestamp(),
              status: "pending",
              lane: ACTIVE_LANE,
              segmentId,
              sessionN,
              athleteUid: athleteId,
              athleteName: athlete.fullName || athlete.athleteName || "",
            },
          },
          { merge: true }
        );

        if (answerEls.length) {
          answerEls.forEach((el) => {
            el.disabled = true;
          });
        } else if (singleResponseEl) {
          singleResponseEl.disabled = true;
        }

        status.textContent = "Submitted. Awaiting coach review.";
        btn.textContent = "Submitted";

        setTimeout(() => {
          window.location.replace(`/athletes/hub/index.html?id=${encodeURIComponent(athleteId)}`);
        }, 500);
      } catch (err) {
        console.error("Honor submit error:", err);
        status.textContent = "Error submitting (see console).";
        btn.disabled = false;
      }
    };
  } catch (e) {
    console.error(e);
    container.innerHTML = `Error loading session.`;
  }
}

loadHonorSession();