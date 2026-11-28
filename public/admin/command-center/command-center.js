import { requireCommandCenterOwner } from "/assets/js/admin-owner-guard.js";
import { archiveProject, loadCommandCenter, saveProject } from "./command-center.service.js";

const DIVISION_LABELS = {
  sandman_academy: "Sandman Academy", sandman_commercial: "Sandman Commercial",
  sandman_digital_tools: "Sandman Digital Tools", sandman_games: "Sandman Games",
  shared_technology: "Shared Technology", business_administration: "Business Administration",
};
const MODULE_LABELS = {
  executive_overview: "Executive Overview", projects_roadmaps: "Projects & Roadmaps",
  development_releases: "Development & Releases", unfinished_work: "Unfinished Work",
  testing_verification: "Testing & Verification", pending_decisions: "Pending Decisions",
  security_infrastructure: "Security & Infrastructure", executive_reports: "Executive Reports",
  completed_archive: "Completed Work Archive",
};
const LIFECYCLE_LABELS = {
  backlog: "Backlog", approved: "Approved", in_development: "In Development", in_review: "In Review",
  merged: "Merged", staging_verified: "Staging Verified", production_released: "Production Released",
  final_acceptance: "Final Acceptance", archived: "Archived",
};
const state = { projects: [], editingId: "", reconciliation: [] };
const el = (id) => document.getElementById(id);
const splitLines = (value) => value.split("\n").map((item) => item.trim()).filter(Boolean);
const stableId = (prefix) => `${prefix}_${crypto.randomUUID().replaceAll("-", "")}`;
const text = (tag, value, className = "") => {
  const node = document.createElement(tag); node.textContent = value;
  if (className) node.className = className;
  return node;
};
const formatDate = (value) => {
  const date = value?.toDate?.() || (value?._seconds ? new Date(value._seconds * 1000) : null);
  return date && !Number.isNaN(date.valueOf()) ? date.toLocaleString() : "Not recorded";
};
const clone = (value) => JSON.parse(JSON.stringify(value || []));

function taskEvidenceFromForm() {
  const label = el("evidenceLabel").value.trim();
  if (!label) return [];
  return [{ id: stableId("evidence"), type: el("evidenceType").value, result: el("evidenceResult").value, label, url: el("evidenceUrl").value.trim() }];
}

function workBreakdownFromForm(existing) {
  const milestones = clone(existing.milestones);
  const taskTitle = el("taskTitle").value.trim();
  if (!taskTitle) return milestones;
  const milestoneTitle = el("milestoneTitle").value.trim();
  const sprintTitle = el("sprintTitle").value.trim();
  if (!milestoneTitle || !sprintTitle) throw new Error("Milestone and sprint are required when adding a task.");
  let milestone = milestones.find((item) => item.title.toLowerCase() === milestoneTitle.toLowerCase());
  if (!milestone) { milestone = { id: stableId("milestone"), title: milestoneTitle, sprints: [] }; milestones.push(milestone); }
  let sprint = milestone.sprints.find((item) => item.title.toLowerCase() === sprintTitle.toLowerCase());
  if (!sprint) { sprint = { id: stableId("sprint"), title: sprintTitle, tasks: [] }; milestone.sprints.push(sprint); }
  sprint.tasks.push({
    id: stableId("task"), title: taskTitle, status: el("taskStatus").value,
    owner: el("taskOwner").value.trim(), teamAssignments: splitLines(el("taskTeam").value),
    dependencies: splitLines(el("taskDependencies").value), evidence: taskEvidenceFromForm(),
  });
  return milestones;
}

function approvalsFromForm(existing) {
  const approvals = clone(existing.approvals);
  const decision = el("approvalDecision").value.trim();
  if (decision) approvals.push({
    id: stableId("approval"), decision, status: el("approvalStatus").value,
    owner: el("approvalOwner").value.trim(), evidenceUrl: el("approvalEvidenceUrl").value.trim(),
  });
  return approvals;
}

function projectFromForm(existing = {}) {
  return {
    title: el("title").value, productId: el("productId").value, summary: el("summary").value, division: el("division").value,
    module: el("module").value, workType: el("workType").value,
    lifecycleStatus: el("lifecycleStatus").value, workState: el("workState").value,
    priority: el("priority").value, projectOwner: el("projectOwner").value,
    teamAssignments: splitLines(el("teamAssignments").value), dependencies: splitLines(el("dependencies").value),
    approvals: approvalsFromForm(existing), repository: el("repository").value, branch: el("branch").value,
    prUrl: el("prUrl").value, environment: el("environment").value,
    blockers: splitLines(el("blockers").value), nextAction: el("nextAction").value,
    milestones: workBreakdownFromForm(existing),
  };
}

function filteredProjects() {
  const query = el("search").value.trim().toLowerCase();
  const lifecycle = el("lifecycleFilter").value;
  const priority = el("priorityFilter").value;
  const division = el("divisionFilter").value;
  return state.projects.filter((project) => {
    const haystack = [project.title, project.summary, project.repository, project.branch, project.nextAction, project.projectOwner].join(" ").toLowerCase();
    return (!query || haystack.includes(query)) && (!lifecycle || project.lifecycleStatus === lifecycle)
      && (!priority || project.priority === priority) && (!division || project.division === division);
  });
}

function renderCounters() {
  const values = {
    countActive: state.projects.filter((item) => item.lifecycleStatus && !["final_acceptance", "archived"].includes(item.lifecycleStatus)).length,
    countRecovery: state.projects.filter((item) => !item.lifecycleStatus || ["blocked", "failed", "paused"].includes(item.workState)).length,
    countDecisions: state.projects.reduce((sum, item) => sum + (item.approvals || []).filter((approval) => approval.status === "pending").length, 0),
    countComplete: state.projects.filter((item) => ["final_acceptance", "archived"].includes(item.lifecycleStatus)).length,
  };
  Object.entries(values).forEach(([id, value]) => { el(id).textContent = String(value); });
}

function renderHistory(project) {
  const list = document.createElement("ol"); list.className = "cc-history";
  for (const entry of project.history || []) {
    const item = document.createElement("li");
    item.append(text("strong", `${LIFECYCLE_LABELS[entry.fromStatus] || entry.fromStatus || "New"} → ${LIFECYCLE_LABELS[entry.toStatus] || entry.toStatus}`));
    item.append(text("span", `${entry.action} · ${entry.workState || "active"} · ${formatDate(entry.at)} · ${entry.evidenceCount || 0} evidence item(s)`));
    list.append(item);
  }
  if (!list.children.length) list.append(text("li", "No history returned."));
  return list;
}

function renderHierarchy(project) {
  const root = document.createElement("div"); root.className = "cc-hierarchy";
  for (const milestone of project.milestones || []) {
    const milestoneNode = document.createElement("section"); milestoneNode.append(text("h4", milestone.title));
    for (const sprint of milestone.sprints || []) {
      const sprintNode = document.createElement("div"); sprintNode.className = "cc-sprint"; sprintNode.append(text("h5", sprint.title));
      const tasks = document.createElement("ul");
      for (const task of sprint.tasks || []) {
        const item = document.createElement("li");
        item.append(text("strong", `${task.title} · ${task.status}`));
        item.append(text("span", `Owner: ${task.owner || "Unassigned"} · Team: ${(task.teamAssignments || []).join(", ") || "None"}`));
        item.append(text("span", `Dependencies: ${(task.dependencies || []).join(", ") || "None"}`));
        const evidence = document.createElement("ul"); evidence.className = "cc-evidence";
        (task.evidence || []).forEach((entry) => evidence.append(text("li", `${entry.result.toUpperCase()} · ${entry.type} · ${entry.label}`)));
        item.append(evidence); tasks.append(item);
      }
      sprintNode.append(tasks); milestoneNode.append(sprintNode);
    }
    root.append(milestoneNode);
  }
  if (!root.children.length) root.append(text("p", "No milestones recorded."));
  return root;
}

function openEditor(project = null) {
  if (project && !project.lifecycleStatus) return;
  state.editingId = project?.id || ""; el("editorTitle").textContent = project ? "Edit project" : "Create project";
  const values = {
    title: project?.title, productId: project?.productId, summary: project?.summary, projectOwner: project?.projectOwner,
    repository: project?.repository, branch: project?.branch, prUrl: project?.prUrl,
    nextAction: project?.nextAction, teamAssignments: (project?.teamAssignments || []).join("\n"),
    dependencies: (project?.dependencies || []).join("\n"), blockers: (project?.blockers || []).join("\n"),
  };
  Object.entries(values).forEach(([id, value]) => { el(id).value = value || ""; });
  el("division").value = project?.division || "sandman_academy";
  el("module").value = project?.module || "projects_roadmaps";
  el("workType").value = project?.workType || "engineering";
  el("workType").disabled = Boolean(project);
  el("lifecycleStatus").value = project?.lifecycleStatus === "archived" ? "final_acceptance" : (project?.lifecycleStatus || "backlog");
  el("workState").value = project?.workState || "active"; el("priority").value = project?.priority || "medium";
  el("environment").value = project?.environment || "not_applicable";
  ["milestoneTitle", "sprintTitle", "taskTitle", "taskOwner", "taskTeam", "taskDependencies", "evidenceLabel", "evidenceUrl", "approvalDecision", "approvalOwner", "approvalEvidenceUrl"].forEach((id) => { el(id).value = ""; });
  el("projectEditor").hidden = false; el("title").focus();
}

function renderProjects() {
  const container = el("projectList"); container.replaceChildren(); const projects = filteredProjects();
  el("resultCount").textContent = `${projects.length} project${projects.length === 1 ? "" : "s"}`;
  if (!projects.length) { container.append(text("p", "No projects match these filters.", "admin-status")); return; }
  projects.forEach((project) => {
    const card = document.createElement("article"); card.className = "cc-project";
    const head = document.createElement("div"); head.className = "cc-project__head";
    const titleWrap = document.createElement("div");
    const legacy = !project.lifecycleStatus;
    titleWrap.append(text("p", `${DIVISION_LABELS[project.division] || project.division || "Unclassified"} · ${project.priority}`, "admin-card__label"), text("h3", project.title));
    head.append(titleWrap, text("span", legacy ? `Legacy · ${project.status || "Unknown"}` : `${LIFECYCLE_LABELS[project.lifecycleStatus] || project.lifecycleStatus} · ${project.workState}`, `cc-status cc-status--${legacy ? "blocked" : project.workState}`));
    card.append(head, text("p", project.summary || "No summary recorded.", "cc-project__summary"));
    const facts = document.createElement("dl"); facts.className = "cc-facts";
    [["Module", MODULE_LABELS[project.module] || project.module], ["Registry product", project.productId || "Portfolio-only record"], ["Owner", project.projectOwner], ["Team", (project.teamAssignments || []).join(", ") || "Unassigned"],
      ["Repository", project.repository || "Non-engineering"], ["Branch", project.branch || "Not assigned"], ["Environment", project.environment],
      ["Dependencies", (project.dependencies || []).join("; ") || "None"], ["Last activity", formatDate(project.updatedAt)],
      ["Blockers", (project.blockers || []).join("; ") || "None"], ["Next action", project.nextAction]].forEach(([label, value]) => facts.append(text("dt", label), text("dd", value)));
    card.append(facts);
    if (project.prUrl) { const link = text("a", "Open pull request", "admin-button"); link.href = project.prUrl; link.target = "_blank"; link.rel = "noopener noreferrer"; card.append(link); }
    const plan = document.createElement("details"); plan.append(text("summary", "Milestones, sprints, tasks & evidence"), renderHierarchy(project)); card.append(plan);
    const decisions = document.createElement("details"); decisions.append(text("summary", `Approvals & decisions (${project.approvals?.length || 0})`));
    const approvalList = document.createElement("ul"); (project.approvals || []).forEach((approval) => approvalList.append(text("li", `${approval.status.toUpperCase()} · ${approval.decision} · ${approval.owner}`))); decisions.append(approvalList); card.append(decisions);
    const audit = document.createElement("details"); audit.append(text("summary", "Auditable status history"), renderHistory(project)); card.append(audit);
    if (legacy) {
      const legacyEvidence = document.createElement("ul");
      for (const entry of project.testEvidence || []) {
        const item = text("li", `${entry.result} · ${entry.type} · ${entry.label}`);
        if (entry.url && /^https:\/\//i.test(entry.url)) { const link = text("a", " View evidence"); link.href = entry.url; link.target = "_blank"; link.rel = "noopener noreferrer"; item.append(link); }
        legacyEvidence.append(item);
      }
      const details = document.createElement("details"); details.append(text("summary", "Original evidence (read-only)"), legacyEvidence); card.append(details);
      card.append(text("p", "Legacy record preserved. Reconciliation required before editing or archival.", "admin-status"));
      container.append(card); return;
    }
    const actions = document.createElement("div"); actions.className = "admin-actions";
    const edit = text("button", "Edit", "admin-button"); edit.type = "button"; edit.addEventListener("click", () => openEditor(project)); actions.append(edit);
    if (project.lifecycleStatus === "final_acceptance") { const archive = text("button", "Archive accepted work", "admin-button"); archive.type = "button"; archive.addEventListener("click", async () => { if (confirm(`Archive ${project.title}?`)) { await archiveProject(project.id); await refresh("Project archived."); } }); actions.append(archive); }
    card.append(actions); container.append(card);
  });
}

async function refresh(message = "") {
  const snapshot = await loadCommandCenter(); state.projects = snapshot.projects || [];
  state.reconciliation = Array.isArray(snapshot.reconciliation?.items) ? snapshot.reconciliation.items : [];
  renderCounters(); renderProjects(); renderReconciliation();
  el("commandStatus").textContent = message || "Owner access verified. Persistent registers loaded."; el("commandStatus").className = "admin-status is-verified";
}

function renderReconciliation() {
  const container = el("reconciliationInventory"); container.replaceChildren();
  for (const item of state.reconciliation) {
    const card = document.createElement("article"); card.className = "cc-project";
    const head = document.createElement("div"); head.className = "cc-project__head";
    head.append(text("h3", item.title), text("span", item.verificationStatus, "cc-status"));
    card.append(head, text("p", item.summary, "cc-project__summary"));
    const facts = document.createElement("dl"); facts.className = "cc-facts";
    [["Classification", item.classification], ["Registry product", item.productId || "Not applicable"], ["Evidence captured", item.capturedAt], ["Sources", item.sources.join("; ")], ["Blocker", item.blocker], ["Next authorized action", item.nextAction]].forEach(([label, value]) => facts.append(text("dt", label), text("dd", value)));
    card.append(facts); container.append(card);
  }
  if (!state.reconciliation.length) container.append(text("p", "No reconciliation inventory was published.", "admin-status"));
}

document.addEventListener("DOMContentLoaded", async () => {
  try { await requireCommandCenterOwner(); el("adminShell").hidden = false; await refresh(); }
  catch (error) { el("accessDenied").hidden = false; el("accessDeniedMessage").textContent = error?.message || "Command Center access denied."; return; }
  el("newProject").addEventListener("click", () => openEditor());
  el("cancelEdit").addEventListener("click", () => { el("projectEditor").hidden = true; state.editingId = ""; });
  ["search", "lifecycleFilter", "priorityFilter", "divisionFilter"].forEach((id) => el(id).addEventListener(id === "search" ? "input" : "change", renderProjects));
  el("projectForm").addEventListener("submit", async (event) => {
    event.preventDefault(); const existing = state.projects.find((item) => item.id === state.editingId) || {}; el("saveProject").disabled = true;
    try { await saveProject(state.editingId, projectFromForm(existing)); el("projectEditor").hidden = true; state.editingId = ""; await refresh("Project hierarchy and audit history saved."); }
    catch (error) { el("formStatus").textContent = error?.message || "Project save failed."; el("formStatus").className = "admin-status is-error"; }
    finally { el("saveProject").disabled = false; }
  });
});
