import {
  db,
  doc,
  updateDoc,
  serverTimestamp
} from "/assets/js/firebase-init.js";

if (window.location.pathname.startsWith("/connect/admissions/calculator/")) {
  const select = document.getElementById("paymentStartMode");
  const startDate = document.getElementById("membershipStartDate");
  const saveButton = document.getElementById("saveDraftButton");
  const dueNowMetric = document.getElementById("dueNow");

  const storageKey = `sandmanCatchupMode:${window.location.pathname}:${new URLSearchParams(window.location.search).get("appointmentId") || new URLSearchParams(window.location.search).get("proposalId") || "active"}`;

  function firstDayOfCurrentMonth() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    return `${year}-${month}-01`;
  }

  function moneyNumber(text = "") {
    return Number(String(text).replace(/[^0-9.]/g, "")) || 0;
  }

  function isCatchup() {
    return select?.value === "existing_member_catchup";
  }

  function ensureOption() {
    if (!select || select.querySelector('option[value="existing_member_catchup"]')) return;

    const option = document.createElement("option");
    option.value = "existing_member_catchup";
    option.textContent = "Existing member catch-up — enrollment + one full monthly balance";
    select.appendChild(option);

    if (sessionStorage.getItem(storageKey) === "1") {
      select.value = "existing_member_catchup";
    }
  }

  function relabelCatchupPresentation() {
    if (!isCatchup()) return;

    const breakdown = document.getElementById("breakdown");
    breakdown?.querySelectorAll(".line span:first-child").forEach((label) => {
      if (/^First-month membership \(/.test(label.textContent || "")) {
        label.textContent = "Existing member catch-up balance";
      }
    });

    const summary = document.getElementById("summary");
    summary?.querySelectorAll(".proposal-summary__item--wide strong").forEach((strong) => {
      if ((strong.textContent || "").includes("First-month membership:")) {
        strong.textContent = (strong.textContent || "").replace(
          "First-month membership:",
          "Existing member catch-up balance:"
        );
      }
    });

    const metricNote = dueNowMetric?.parentElement?.querySelector(".metric-note");
    if (metricNote) {
      metricNote.textContent = "Annual enrollment + existing-member catch-up balance";
    }

    const help = document.getElementById("deferredEligibility");
    if (help) {
      help.textContent = "Catch-up mode collects one full monthly balance today. Normal recurring billing continues on the 5th.";
    }
  }

  function triggerRecalculate() {
    startDate?.dispatchEvent(new Event("change", { bubbles: true }));
    select?.dispatchEvent(new Event("change", { bubbles: true }));
    window.setTimeout(relabelCatchupPresentation, 0);
  }

  async function persistCatchup(proposalId) {
    if (!proposalId || !isCatchup()) return;

    const monthlyBalance = moneyNumber(
      document.getElementById("monthlyTotal")?.textContent || ""
    );

    const dueNow = moneyNumber(
      document.getElementById("dueNow")?.textContent || ""
    );

    await updateDoc(doc(db, "proposals", proposalId), {
      "pricing.paymentStartMode": "existing_member_catchup",
      "pricing.catchupExistingMember": true,
      "pricing.catchupLabel": "Existing member catch-up balance",
      "pricing.catchupBalance": monthlyBalance,
      "pricing.dueNow": dueNow,
      "pricing.prorationPercent": 100,
      "pricing.proratedFirstMonth": monthlyBalance,
      "pricing.firstMonthDueNow": monthlyBalance,
      "pricing.membershipStartDate": startDate?.value || firstDayOfCurrentMonth(),
      "pricing.catchupRecordedAt": serverTimestamp(),
      updatedAt: serverTimestamp()
    });
  }

  ensureOption();

  select?.addEventListener("change", () => {
    if (isCatchup()) {
      sessionStorage.setItem(storageKey, "1");
      if (startDate) {
        startDate.value = firstDayOfCurrentMonth();
      }
      triggerRecalculate();
      return;
    }

    sessionStorage.removeItem(storageKey);
  });

  if (isCatchup()) {
    if (startDate) startDate.value = firstDayOfCurrentMonth();
    triggerRecalculate();
  }

  const presentationObserver = new MutationObserver(() => {
    if (isCatchup()) relabelCatchupPresentation();
  });

  const breakdown = document.getElementById("breakdown");
  const summary = document.getElementById("summary");
  if (breakdown) presentationObserver.observe(breakdown, { childList: true, subtree: true, characterData: true });
  if (summary) presentationObserver.observe(summary, { childList: true, subtree: true, characterData: true });

  if (saveButton) {
    let lastPersistedProposalId = "";

    const saveObserver = new MutationObserver(async () => {
      if (!isCatchup()) return;

      const text = String(saveButton.textContent || "").trim();
      const match = text.match(/P-[A-Z0-9-]+/i);
      const proposalId = match?.[0] || new URLSearchParams(window.location.search).get("proposalId") || "";

      if (!proposalId || proposalId === lastPersistedProposalId) return;
      if (!/Saved|Draft Saved/i.test(text)) return;

      lastPersistedProposalId = proposalId;

      try {
        saveButton.disabled = true;
        await persistCatchup(proposalId);
        saveButton.textContent = `1. Draft Saved — ${proposalId} · Catch-up recorded`;
      } catch (error) {
        lastPersistedProposalId = "";
        console.error("Unable to persist catch-up payment context:", error);
        window.alert("Draft saved, but the existing-member catch-up note did not persist. Please save again before continuing.");
      } finally {
        saveButton.disabled = false;
      }
    });

    saveObserver.observe(saveButton, { childList: true, subtree: true, characterData: true });
  }
}
