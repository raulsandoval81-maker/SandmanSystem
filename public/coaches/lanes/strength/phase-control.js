import {
  db,
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
} from "/assets/js/firebase-init.js";
import { requireCoach } from "/assets/js/coach-guard.js";
import {
  loadStrengthPhaseContext,
  normalizeStrengthPhase,
  STRENGTH_PHASE_LABELS,
} from "/assets/js/athlete-lane-context.js";

const select = document.getElementById("strengthPhaseSelect");
const save = document.getElementById("strengthPhaseSave");
const summary = document.getElementById("strengthPhaseSummary");
const status = document.getElementById("strengthPhaseStatus");
const settingRef = doc(db, "strengthPhaseSettings", "system");

function timestampLabel(value) {
  try {
    return value?.toDate?.().toLocaleString?.() || "Not yet recorded";
  } catch {
    return "Not yet recorded";
  }
}

function showStatus(message, isError = false) {
  if (!status) return;
  status.textContent = message;
  status.style.color = isError ? "#fca5a5" : "";
}

async function initializePhaseControl() {
  if (!select || !save || !summary) return;

  try {
    const access = await requireCoach();
    const settingSnap = await getDoc(settingRef);
    const setting = settingSnap.exists() ? settingSnap.data() || {} : {};
    const context = await loadStrengthPhaseContext({
      operationalPhase: setting.activePhase,
    });

    select.value = context.phase;
    select.disabled = false;
    save.disabled = false;

    const sourceText = context.source === "operational"
      ? `Coach-controlled · ${timestampLabel(setting.updatedAt)} · ${setting.updatedBy || "Coach"}`
      : "Legacy fallback currently active; save to establish Coach-controlled authority.";
    summary.textContent = `${STRENGTH_PHASE_LABELS[context.phase]} · ${sourceText}`;

    save.addEventListener("click", async () => {
      const activePhase = normalizeStrengthPhase(select.value);
      if (!activePhase) {
        showStatus("Select a valid Strength phase.", true);
        return;
      }

      save.disabled = true;
      select.disabled = true;
      showStatus("Saving…");

      try {
        await setDoc(settingRef, {
          scopeType: "system",
          scopeId: "sandman",
          activePhase,
          updatedAt: serverTimestamp(),
          updatedBy: access.uid,
        });
        summary.textContent = `${STRENGTH_PHASE_LABELS[activePhase]} · Coach-controlled · ${access.email || access.uid}`;
        showStatus("Active Strength phase saved.");
      } catch (error) {
        console.error("Strength phase save failed:", error);
        showStatus("Strength phase was not saved. Coach access is required.", true);
      } finally {
        select.disabled = false;
        save.disabled = false;
      }
    });
  } catch (error) {
    console.error("Strength phase authority unavailable:", error);
    summary.textContent = "Coach authority required to manage the active phase.";
    showStatus("Sign in with an active Coach or Admin account.", true);
  }
}

initializePhaseControl();
