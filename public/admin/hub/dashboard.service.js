// public/admin/dashboard.service.js

import { requireAdmin } from "/assets/js/admin-guard.js";
import { applyXpAdjustment } from "../services/admin.service.js";

document.addEventListener("DOMContentLoaded", async () => {
  await requireAdmin();

  const $ = (id) => document.getElementById(id);

  const uidInput = $("xp-uid");
  const amountInput = $("xp-amount");
  const kindSelect = $("xp-kind");
  const noteInput = $("xp-note");
  const applyBtn = $("xp-apply");
  const statusEl = $("xp-status");

  function paintKpis() {
    $("kpi-athletes") && ($("kpi-athletes").textContent = "128");
    $("kpi-xp7") && ($("kpi-xp7").textContent = "642");
    $("kpi-ceremonies") && ($("kpi-ceremonies").textContent = "6");
    $("kpi-att") && ($("kpi-att").textContent = "78%");
  }

  function setStatus(message, isError = false) {
    if (!statusEl) return;
    statusEl.textContent = message;
    statusEl.style.color = isError ? "#ff8a8a" : "#9aa3b2";
  }

  function clearForm() {
    if (uidInput) uidInput.value = "";
    if (amountInput) amountInput.value = "";
    if (noteInput) noteInput.value = "";
    if (kindSelect) kindSelect.value = "DAILY_GRIND";
  }

  async function handleApplyXp() {
    const uid = String(uidInput?.value || "").trim().toUpperCase();
    const amount = Number(amountInput?.value || 0);
    const kind = String(kindSelect?.value || "").trim().toUpperCase();
    const note = String(noteInput?.value || "").trim();

    if (!uid) {
      setStatus("Athlete UID is required.", true);
      return;
    }

    if (!Number.isFinite(amount) || amount <= 0) {
      setStatus("Enter a valid XP amount.", true);
      return;
    }

    if (!kind) {
      setStatus("XP type is required.", true);
      return;
    }

    setStatus("Applying adjustment...");

    const result = await applyXpAdjustment({
      uid,
      amount,
      kind,
      note
    });

    setStatus(
      `Applied +${result.amount} XP to ${result.uid}. ${result.beforeXp} → ${result.afterXp}`
    );

    clearForm();
  }

  if (applyBtn) {
    applyBtn.addEventListener("click", async () => {
      applyBtn.disabled = true;
      try {
        await handleApplyXp();
      } catch (err) {
        console.error("[dashboard.service] XP adjustment failed:", err);
        setStatus(err?.message || "XP adjustment failed.", true);
      } finally {
        applyBtn.disabled = false;
      }
    });
  }

  paintKpis();
  setStatus("Dashboard ready.");
});