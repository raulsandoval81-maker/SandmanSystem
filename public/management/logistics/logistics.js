import { auth, functions, httpsCallable } from "/assets/js/firebase-init.js";
import { managementLoginUrl, requireManagement } from "/management/shared/guards/management-guard.js";

const el = (id) => document.getElementById(id);

async function start() {
  const context = await requireManagement();
  el("logisticsScope").textContent = context.isSystemAdmin ? "All authorized locations" : (context.scope?.locationIds || []).join(", ") || "No location scope assigned";
  const response = await httpsCallable(functions, "listManagementAttendance")({});
  const sessions = Array.isArray(response.data?.sessions) ? response.data.sessions : [];
  el("activePracticeCount").textContent = String(sessions.filter((item) => item.practiceStatus === "active" && !["pending_review", "finalized"].includes(item.status)).length);
  el("pendingReviewCount").textContent = String(sessions.filter((item) => item.status === "pending_review").length);
  el("logisticsStatus").textContent = "Current location operations loaded.";
}

start().catch((error) => {
  console.error("[management-logistics] load failed", error);
  el("logisticsStatus").textContent = error?.message || "Operations could not be loaded.";
  el("logisticsStatus").classList.add("is-error");
  if (!auth.currentUser || auth.currentUser.isAnonymous) window.setTimeout(() => window.location.replace(managementLoginUrl()), 1200);
});
