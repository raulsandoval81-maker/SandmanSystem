import { functions, httpsCallable, db, collection, getDocs, query, where } from "/assets/js/firebase-init.js";
import { requireManagement, managementLoginUrl } from "/management/shared/guards/management-guard.js";

const $ = id => document.getElementById(id);
const clean = x => String(x ?? "").trim();
const esc = x => clean(x).replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#39;");
const money = n => "$" + (Number(n) / 100).toFixed(2);
const params = new URLSearchParams(location.search);
const embedded = window.parent !== window && params.get("embedded") === "1";
const initialProposalId = clean(params.get("proposalId")).toUpperCase();
const call = httpsCallable(functions, "manualEdgeCaseProposal");
let proposal = null;
let preview = null;
let pendingEntries = null;
const status = msg => { $("status").textContent = msg; };
const invalidate = () => {
  preview = null; pendingEntries = null;
  $("previewPanel").hidden = true; $("confirm").checked = false; $("commit").disabled = true;
};
function receiptPeriod(p) {
  const all = [
    ...(Array.isArray(p.requestedPeriods) ? p.requestedPeriods : []),
    ...(Array.isArray(p.periods) ? p.periods : []),
    ...(Array.isArray(p.membershipPeriodAllocations) ? p.membershipPeriodAllocations.map(a => a.period) : [])
  ];
  const distinct = [...new Set(all.filter(Boolean))];
  return distinct.length === 1 ? distinct[0] : "";
}
function renderReceipts() {
  const payments = Array.isArray(proposal?.priorPayments) ? proposal.priorPayments : [];
  $("receiptRows").innerHTML = payments.map((p, i) => {
    const period = receiptPeriod(p);
    const rate = Number(p.historicalMonthlyRateCents ?? p.membershipPeriodAllocations?.[0]?.requiredCents ?? Math.round(Number(proposal.pricing?.monthlyBalance) * 100));
    const supported = period && clean(p.paymentId);
    return `<div class="receipt" data-receipt="${i}">
      <div><strong>${esc(period || "Complex / multiple periods")}</strong> — ${money(p.amountCents)} received (${esc(p.paymentMethod || "payment")})</div>
      <small>Existing allocation: ${money(p.membershipAmountCents)} membership; ${money(p.enrollmentFeeAmountCents)} enrollment fee</small>
      <div class="receipt-grid">
      <label>Enrollment allocation ($)<input inputmode="decimal" class="fee" type="number" step=".01" min="0" max="${Number(p.amountCents)/100}" value="${(Number(p.enrollmentFeeAmountCents||0)/100).toFixed(2)}" ${supported?"":"disabled"}></label>
      <label>Historical membership rate ($)<input inputmode="decimal" class="rate" type="number" step=".01" min=".01" value="${(rate/100).toFixed(2)}" ${supported?"":"disabled"}></label>
      </div>${supported?"":"<small>This receipt requires separate review; multi-month allocations are not edited by this action.</small>"}
    </div>`;
  }).join("") || "<p>No historical receipts found.</p>";
  $("receiptRows").querySelectorAll("input").forEach(el => el.addEventListener("input", invalidate));
}
async function loadCase(event) {
  event?.preventDefault();
  invalidate(); $("editPanel").hidden = true; $("recoveryPanel").hidden = true; proposal = null;
  $("certifyConversion").checked = false;
  const id = embedded ? initialProposalId : clean($("proposalId").value).toUpperCase();
  if (!/^P-\d{6}$/.test(id)) return status("Enter a valid proposal ID.");
  status("Loading proposal...");
  try {
    await requireManagement();
    const response = await call({ proposalId: id, mode: "load" });
    proposal = response.data;
    if (proposal.proposalId !== id) throw new Error("The loaded proposal does not match the requested proposal.");
    if (proposal.caseType === "paid_in_full_recovery" && proposal.readOnly === true) {
      const p = proposal.payment || {};
      const display = value => value == null ? "Requires verification" : money(value);
      const fields = [
        ["Collected cash/check", display(p.amountCents)],
        ["Membership allocation", display(p.membershipAmountCents)],
        ["Annual fee outstanding", display(p.annualFeeOutstandingCents)],
        ["Coverage begins", p.membershipStartDate || "Requires verification"],
        ["Paid through", p.membershipPaidThroughDate || "Requires verification"],
        ["Next billing", p.nextBillingDate || "Requires verification"]
      ];
      $("recoverySummary").innerHTML = fields.map(([label, value]) =>
        '<div class="edge-financial-item"><small>' + esc(label) + '</small><strong>' + esc(value) + '</strong></div>'
      ).join("");
      $("recoveryIntakeLink").href = "/intake-management/?proposalId=" + encodeURIComponent(id);
      $("recoveryPanel").hidden = false;
      return status("Verified Paid-in-Full proposal loaded. Continue through Intake Management; the Draft ledger editor is locked.");
    }
    if (clean(proposal.status).toUpperCase() !== "DRAFT") {
      return status("This proposal requires Management review; no edit is available.");
    }
    $("editPanel").hidden = false;
    renderReceipts();
    status("Loaded " + id + ". Review each existing receipt; nothing has been changed.");
  } catch(e) { status(e.message || "Unable to load proposal."); }
}
function entriesFromForm() {
  const payments = proposal.priorPayments || [];
  const entries = [];
  const parseCents = (input, name) => {
    if (!/^\d+(?:\.\d{1,2})?$/.test(input.value)) throw new Error(name+" needs a valid dollar amount.");
    const cents = Math.round(Number(input.value) * 100);
    if (!Number.isSafeInteger(cents)) throw new Error(name+" is too large.");
    return cents;
  };
  $("receiptRows").querySelectorAll(".receipt").forEach(row => {
    const i = Number(row.dataset.receipt), p = payments[i];
    const feeInput = row.querySelector(".fee"), rateInput = row.querySelector(".rate");
    if (feeInput.disabled) return;
    const fee = parseCents(feeInput, "Enrollment allocation");
    const rate = parseCents(rateInput, "Historical rate");
    if (fee !== Number(p.enrollmentFeeAmountCents || 0) || rate !== Number(p.historicalMonthlyRateCents ?? p.membershipPeriodAllocations?.[0]?.requiredCents ?? Math.round(Number(proposal.pricing?.monthlyBalance) * 100))) {
      entries.push({paymentId: clean(p.paymentId), enrollmentFeeAmountCents: fee, historicalMonthlyRateCents: rate});
    }
  });
  if (!entries.length && !$("certifyConversion").checked) throw new Error("Change an allocation before previewing.");
  return entries;
}
async function previewCase() {
  invalidate();
  try {
    pendingEntries = entriesFromForm();
    status("Calculating authoritative preview...");
    const response = await call({proposalId:proposal.proposalId, mode:"preview", entries:pendingEntries, certifyConversion:$("certifyConversion").checked});
    preview = response.data;
    const b = preview.before, a = preview.after;
    $("previewResults").textContent =
      "Collected cash: " + money(preview.originalTotalCents) + " → " + money(preview.originalTotalCents) +
      "\nEnrollment paid: " + money(b.enrollmentPaidCents) + " → " + money(a.enrollmentPaidCents) +
      "\nEnrollment outstanding: " + money(b.enrollmentRemainingCents) + " → " + money(a.enrollmentRemainingCents) +
      "\nUnapplied cash: " + money(b.unappliedMembershipCents) + " → " + money(a.unappliedMembershipCents) +
      "\nFully paid months before: " + (b.fullyPaidPeriods.join(", ") || "None") +
      "\nFully paid months after: " + (a.fullyPaidPeriods.join(", ") || "None") +
      "\nChanged receipts:\n" +
      preview.receiptChanges.filter(x =>
        Number(x.beforeMembershipCents) !== Number(x.afterMembershipCents) ||
        Number(x.beforeEnrollmentCents) !== Number(x.afterEnrollmentCents)
      ).map(x => "  " + x.paymentId + ": membership " + money(x.beforeMembershipCents) +
        " → " + money(x.afterMembershipCents) + "; enrollment " +
        money(x.beforeEnrollmentCents) + " → " + money(x.afterEnrollmentCents)).join("\n") +
      (preview.certifyConversion ? "\nVerified history may support a separately signed Paid-in-Full agreement." : "") +
      "\nCheckout authorized: NO";
    $("previewResults").style.whiteSpace = "pre-wrap";
    $("previewPanel").hidden = false;
    $("commit").disabled = !$("confirm").checked;
    status("Preview ready. Verify original evidence before saving.");
  } catch(e) {
    invalidate();
    status(e.message || "Preview blocked.");
  }
}
async function commitCase() {
  if (!preview || !pendingEntries || !$("confirm").checked) return;
  const reason = clean($("reason").value);
  if (reason.length < 10 || reason.length > 500) return status("Provide a 10–500 character audit reason.");
  $("commit").disabled = true;
  status("Saving the previewed allocation...");
  try {
    const response = await call({
      proposalId:proposal.proposalId, mode:"commit",
      entries:pendingEntries, expectedFingerprint:preview.fingerprint,
      certifyConversion:preview.certifyConversion,
      reason, actionId:crypto.randomUUID()
    });
    invalidate();
    $("editPanel").hidden = true;
    status("Saved and audited: "+response.data.auditId+". No money collected. Reload the record before another adjustment.");
    if (embedded && response.data.proposalId === initialProposalId && response.data.auditId) {
      window.parent.postMessage({
        type: "sandman:edge-case-saved",
        proposalId: initialProposalId,
        auditId: response.data.auditId,
      }, location.origin);
    }
  } catch(e) {
    invalidate();
    status("Not saved: "+(e.message || "Commit failed")+". Reload and preview again.");
  }
}
$("loadForm").addEventListener("submit", loadCase);
$("preview").addEventListener("click", previewCase);
$("confirm").addEventListener("change", () => $("commit").disabled = !preview || !$("confirm").checked);
$("commit").addEventListener("click", commitCase);
$("reason").addEventListener("input", invalidate);
$("certifyConversion").addEventListener("change", invalidate);
$("proposalId").value = initialProposalId;
if (embedded) {
  $("loadForm").hidden = true;
  $("backToBilling").hidden = true;
  $("directLookup").open = false;
}
requireManagement().then(() => {
  if (embedded || initialProposalId) void loadCase();
}).catch(() => location.replace(managementLoginUrl()));

// Case discovery mirrors the location-scoped Management Billing read boundary.
// Search never creates payment records or calls the adjustment executor.
const searchForm = $("caseSearchForm");
const searchInput = $("caseSearch");
const searchButton = $("caseSearchButton");
const searchStatus = $("caseSearchStatus");
const searchResults = $("caseSearchResults");
let searchGeneration = 0;
const searchMessage = msg => { searchStatus.textContent = msg; };
const normalize = value => clean(value).toLowerCase();

function proposalDisplayName(record) {
  return clean(record.prospect?.familyName)
    || clean(record.prospect?.primaryContactName)
    || clean(record.athletes?.[0]?.name)
    || clean(record.lockedSnapshot?.athletes?.[0]?.name)
    || "Unnamed proposal";
}
function searchableProposalText(record, id) {
  const athletes = [
    ...(Array.isArray(record.athletes) ? record.athletes : []),
    ...(Array.isArray(record.lockedSnapshot?.athletes) ? record.lockedSnapshot.athletes : [])
  ];
  return [
    id, record.prospect?.familyName, record.prospect?.primaryContactName,
    record.prospect?.parentName, record.prospect?.email,
    record.prospect?.primaryContactEmail,
    ...athletes.flatMap(a => [a.name, a.firstName, a.lastName]),
  ].map(normalize).join(" ");
}
async function scopedProposals(context) {
  if (context.isSystemAdmin === true) {
    const snapshot = await getDocs(collection(db, "proposals"));
    return snapshot.docs.map(item => ({ ...item.data(), id: item.id }));
  }
  const ids = Array.isArray(context.scope?.locationIds) ? context.scope.locationIds.filter(Boolean) : [];
  if (!ids.length) return [];
  const records = new Map();
  for (let i = 0; i < ids.length; i += 10) {
    const snapshot = await getDocs(query(collection(db, "proposals"), where("locationId", "in", ids.slice(i, i + 10))));
    for (const item of snapshot.docs) records.set(item.id, { ...item.data(), id: item.id });
  }
  return [...records.values()];
}
searchForm.addEventListener("submit", async event => {
  event.preventDefault();
  const term = normalize(searchInput.value);
  if (term.length < 2) return searchMessage("Enter at least two characters.");
  const run = ++searchGeneration;
  searchButton.disabled = true;
  searchResults.replaceChildren();
  searchMessage("Searching permitted proposals…");
  try {
    const context = await requireManagement();
    const records = await scopedProposals(context);
    if (run !== searchGeneration) return;
    const matches = records.filter(p => {
      const id = clean(p.proposalId || p.id).toUpperCase();
      return /^P-\d{6}$/.test(id) && searchableProposalText(p, id).includes(term);
    }).sort((a, b) => clean(a.proposalId || a.id).localeCompare(clean(b.proposalId || b.id))).slice(0, 30);
    if (!matches.length) {
      searchMessage("No matching proposal found within your access scope. Check Billing or Proposals for earlier admission stages.");
      return;
    }
    searchMessage(matches.length === 30 ? "Showing up to 30 matching proposals. Narrow your search." : matches.length + " matching proposal(s). Select the correct family.");
    searchResults.innerHTML = matches.map((p, i) => {
      const id = clean(p.proposalId || p.id).toUpperCase();
      const state = clean(p.status).replaceAll("_", " ") || "Status unavailable";
      return '<button type="button" class="edge-result" data-case-index="' + i + '">' +
        '<span><strong>' + esc(proposalDisplayName(p)) + '</strong><small>' + esc(id) + ' · ' + esc(p.locationName || p.locationId || "Location unknown") + '</small></span>' +
        '<span class="edge-result-status">' + esc(state) + '</span></button>';
    }).join("");
    searchResults.querySelectorAll("[data-case-index]").forEach(button => {
      button.addEventListener("click", () => {
        const record = matches[Number(button.dataset.caseIndex)];
        $("proposalId").value = clean(record.proposalId || record.id).toUpperCase();
        $("directLookup").open = true;
        void loadCase();
      });
    });
  } catch (error) {
    searchMessage("Case search unavailable: " + (error?.message || "Access or network error") + ". Use an existing Proposal ID or the Billing dashboard.");
  } finally { if (run === searchGeneration) searchButton.disabled = false; }
});
if (/^P-\d{6}$/.test(initialProposalId)) {
  searchInput.value = initialProposalId;
  $("directLookup").open = true;
}
