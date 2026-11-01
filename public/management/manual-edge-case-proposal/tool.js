import { db, doc, getDoc, functions, httpsCallable } from "/assets/js/firebase-init.js";
import { requireManagement, managementLoginUrl } from "/management/shared/guards/management-guard.js";

const $ = id => document.getElementById(id);
const clean = x => String(x ?? "").trim();
const esc = x => clean(x).replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#39;");
const money = n => "$" + (Number(n) / 100).toFixed(2);
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
  invalidate(); $("editPanel").hidden = true; proposal = null;
  const id = clean($("proposalId").value).toUpperCase();
  if (!/^P-\d{6}$/.test(id)) return status("Enter a valid proposal ID.");
  status("Loading proposal...");
  try {
    await requireManagement();
    const snap = await getDoc(doc(db, "proposals", id));
    if (!snap.exists()) throw new Error("Proposal not found.");
    proposal = { ...snap.data(), proposalId: id };
    if (clean(proposal.status).toUpperCase() !== "DRAFT") {
      return status("Only unsigned DRAFT proposals can use this allocation correction.");
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
  if (!entries.length) throw new Error("Change an allocation before previewing.");
  return entries;
}
async function previewCase() {
  invalidate();
  try {
    pendingEntries = entriesFromForm();
    status("Calculating authoritative preview...");
    const response = await call({proposalId:proposal.proposalId, mode:"preview", entries:pendingEntries});
    preview = response.data;
    const b = preview.before, a = preview.after;
    $("previewResults").textContent =
      "Collected cash: " + money(preview.originalTotalCents) + " → " + money(preview.originalTotalCents) +
      "\nEnrollment paid: " + money(b.enrollmentPaidCents) + " → " + money(a.enrollmentPaidCents) +
      "\nEnrollment outstanding: " + money(b.enrollmentRemainingCents) + " → " + money(a.enrollmentRemainingCents) +
      "\nUnapplied cash: " + money(b.unappliedMembershipCents) + " → " + money(a.unappliedMembershipCents) +
      "\\nFully paid months before: " + (b.fullyPaidPeriods.join(", ") || "None") +
      "\\nFully paid months after: " + (a.fullyPaidPeriods.join(", ") || "None") +
      "\\nChanged receipts:\\n" +
      preview.receiptChanges.filter(x =>
        Number(x.beforeMembershipCents) !== Number(x.afterMembershipCents) ||
        Number(x.beforeEnrollmentCents) !== Number(x.afterEnrollmentCents)
      ).map(x => "  " + x.paymentId + ": membership " + money(x.beforeMembershipCents) +
        " → " + money(x.afterMembershipCents) + "; enrollment " +
        money(x.beforeEnrollmentCents) + " → " + money(x.afterEnrollmentCents)).join("\\n") +
      "\\nCheckout authorized: NO";
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
      reason, actionId:crypto.randomUUID()
    });
    invalidate();
    $("editPanel").hidden = true;
    status("Saved and audited: "+response.data.auditId+". No money collected. Reload the record before another adjustment.");
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
$("proposalId").value = new URLSearchParams(location.search).get("proposalId") || "";
requireManagement().then(() => {
  if ($("proposalId").value) void loadCase();
}).catch(() => location.replace(managementLoginUrl()));
