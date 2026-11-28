import { requireCommandCenterOwner } from "/assets/js/admin-owner-guard.js";
import { archiveProject, loadCommandCenter, saveProject } from "./command-center.service.js";

const MODULE_LABELS = {
  executive_overview: "Executive Overview",
  projects_roadmaps: "Projects & Roadmaps",
  development_releases: "Development & Releases",
  recovery_queue: "Unfinished Work / Recovery Queue",
  testing_verification: "Testing & Verification",
  approvals_decisions: "Approvals & Decisions",
  completed_archive: "Completed Work Archive",
};
const STATUS_LABELS = {
  planned: "Planned", in_progress: "In progress", blocked: "Blocked", built: "Built",
  tested: "Tested", merged: "Merged", deployed: "Deployed", verified: "Verified", archived: "Archived",
};

const state = { projects: [], editingId: "" };
const el = (id) => document.getElementById(id);
const text = (tag, value, className = "") => {
  const node = document.createElement(tag);
  node.textContent = value;
  if (className) node.className = className;
  return node;
};
const formatDate = (value) => {
  const date = value?.toDate?.() || (value?._seconds ? new Date(value._seconds * 1000) : null);
  return date && !Number.isNaN(date.valueOf()) ? date.toLocaleString() : "Not recorded";
};

function evidenceFromForm() {
  const label = el("evidenceLabel").value.trim();
  if (!label) return [];
  return [{
    type: el("evidenceType").value,
    result: el("evidenceResult").value,
    label,
    url: el("evidenceUrl").value.trim(),
  }];
}

function projectFromForm(existing = {}) {
  const freshEvidence = evidenceFromForm();
  return {
    title: el("title").value,
    summary: el("summary").value,
    module: el("module").value,
    status: el("projectStatus").value,
    priority: el("priority").value,
    repository: el("repository").value,
    branch: el("branch").value,
    prUrl: el("prUrl").value,
    environment: el("environment").value,
    testEvidence: freshEvidence.length ? [...(existing.testEvidence || []), ...freshEvidence] : (existing.testEvidence || []),
    blockers: el("blockers").value.split("\n").map((value) => value.trim()).filter(Boolean),
    nextAction: el("nextAction").value,
  };
}

function filteredProjects() {
  const query = el("search").value.trim().toLowerCase();
  const status = el("statusFilter").value;
  const priority = el("priorityFilter").value;
  return state.projects.filter((project) => {
    const haystack = [project.title, project.summary, project.repository, project.branch, project.nextAction].join(" ").toLowerCase();
    return (!query || haystack.includes(query)) && (!status || project.status === status) && (!priority || project.priority === priority);
  });
}

function renderCounters() {
  const active = state.projects.filter((item) => !["verified", "archived"].includes(item.status)).length;
  const blocked = state.projects.filter((item) => item.status === "blocked").length;
  const awaiting = state.projects.filter((item) => ["built", "tested", "merged", "deployed"].includes(item.status)).length;
  const complete = state.projects.filter((item) => ["verified", "archived"].includes(item.status)).length;
  [["countActive", active], ["countBlocked", blocked], ["countAwaiting", awaiting], ["countComplete", complete]]
    .forEach(([id, value]) => { el(id).textContent = String(value); });
}

function renderHistory(project) {
  const list = document.createElement("ol");
  list.className = "cc-history";
  for (const entry of project.history || []) {
    const item = document.createElement("li");
    item.append(text("strong", `${STATUS_LABELS[entry.fromStatus] || "New"} → ${STATUS_LABELS[entry.toStatus] || entry.toStatus}`));
    item.append(text("span", `${entry.action} · ${formatDate(entry.at)} · ${entry.evidenceCount || 0} evidence item(s)`));
    list.append(item);
  }
  if (!list.children.length) list.append(text("li", "No history returned."));
  return list;
}

function openEditor(project = null) {
  state.editingId = project?.id || "";
  el("editorTitle").textContent = project ? "Edit project" : "Create project";
  for (const field of ["title", "summary", "repository", "branch", "prUrl", "nextAction"]) el(field).value = project?.[field] || "";
  el("module").value = project?.module || "projects_roadmaps";
  el("projectStatus").value = project?.status === "archived" ? "verified" : (project?.status || "planned");
  el("priority").value = project?.priority || "medium";
  el("environment").value = project?.environment || "not_applicable";
  el("blockers").value = (project?.blockers || []).join("\n");
  for (const id of ["evidenceLabel", "evidenceUrl"]) el(id).value = "";
  el("projectEditor").hidden = false;
  el("title").focus();
}

function renderProjects() {
  const container = el("projectList");
  container.replaceChildren();
  const projects = filteredProjects();
  el("resultCount").textContent = `${projects.length} project${projects.length === 1 ? "" : "s"}`;
  if (!projects.length) {
    container.append(text("p", "No projects match these filters.", "admin-status"));
    return;
  }
  projects.forEach((project) => {
    const card = document.createElement("article");
    card.className = "cc-project";
    const head = document.createElement("div");
    head.className = "cc-project__head";
    const titleWrap = document.createElement("div");
    titleWrap.append(text("p", `${MODULE_LABELS[project.module] || project.module} · ${project.priority}`, "admin-card__label"));
    titleWrap.append(text("h3", project.title));
    head.append(titleWrap, text("span", STATUS_LABELS[project.status] || project.status, `cc-status cc-status--${project.status}`));
    card.append(head, text("p", project.summary || "No summary recorded.", "cc-project__summary"));
    const facts = document.createElement("dl");
    facts.className = "cc-facts";
    [
      ["Repository", project.repository], ["Branch", project.branch || "Not assigned"],
      ["Environment", project.environment], ["Last activity", formatDate(project.updatedAt)],
      ["Blockers", project.blockers?.join("; ") || "None"], ["Next action", project.nextAction],
    ].forEach(([label, value]) => {
      facts.append(text("dt", label), text("dd", value));
    });
    card.append(facts);
    if (project.prUrl) {
      const link = text("a", "Open pull request", "admin-button");
      link.href = project.prUrl; link.target = "_blank"; link.rel = "noopener noreferrer";
      card.append(link);
    }
    const details = document.createElement("details");
    details.append(text("summary", `Evidence & audit history (${project.testEvidence?.length || 0})`));
    const evidence = document.createElement("ul"); evidence.className = "cc-evidence";
    (project.testEvidence || []).forEach((item) => evidence.append(text("li", `${item.result.toUpperCase()} · ${item.type} · ${item.label}`)));
    details.append(evidence, renderHistory(project));
    card.append(details);
    const actions = document.createElement("div"); actions.className = "admin-actions";
    const edit = text("button", "Edit", "admin-button"); edit.type = "button"; edit.addEventListener("click", () => openEditor(project)); actions.append(edit);
    if (project.status === "verified") {
      const archive = text("button", "Archive verified work", "admin-button"); archive.type = "button";
      archive.addEventListener("click", async () => {
        if (!confirm(`Archive ${project.title}?`)) return;
        await archiveProject(project.id); await refresh("Project archived.");
      });
      actions.append(archive);
    }
    card.append(actions); container.append(card);
  });
}

async function refresh(message = "") {
  const snapshot = await loadCommandCenter();
  state.projects = snapshot.projects || [];
  renderCounters(); renderProjects();
  el("commandStatus").textContent = message || "Owner access verified. Persistent records loaded.";
  el("commandStatus").className = "admin-status is-verified";
}

document.addEventListener("DOMContentLoaded", async () => {
  try {
    await requireCommandCenterOwner();
    el("adminShell").hidden = false;
    await refresh();
  } catch (error) {
    el("accessDenied").hidden = false;
    el("accessDeniedMessage").textContent = error?.message || "Command Center access denied.";
    return;
  }
  el("newProject").addEventListener("click", () => openEditor());
  el("cancelEdit").addEventListener("click", () => { el("projectEditor").hidden = true; state.editingId = ""; });
  ["search", "statusFilter", "priorityFilter"].forEach((id) => el(id).addEventListener(id === "search" ? "input" : "change", renderProjects));
  el("projectForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const existing = state.projects.find((item) => item.id === state.editingId) || {};
    el("saveProject").disabled = true;
    try {
      await saveProject(state.editingId, projectFromForm(existing));
      el("projectEditor").hidden = true; state.editingId = "";
      await refresh("Project and audit history saved.");
    } catch (error) {
      el("formStatus").textContent = error?.message || "Project save failed.";
      el("formStatus").className = "admin-status is-error";
    } finally { el("saveProject").disabled = false; }
  });
});
