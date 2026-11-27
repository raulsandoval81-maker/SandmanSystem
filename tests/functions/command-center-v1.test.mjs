import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const html = fs.readFileSync("public/admin/command-center/index.html", "utf8");
const client = fs.readFileSync("public/admin/command-center/command-center.js", "utf8");
const service = fs.readFileSync("public/admin/command-center/command-center.service.js", "utf8");
const guard = fs.readFileSync("public/assets/js/admin-owner-guard.js", "utf8");
const backend = fs.readFileSync("functions/src/admin/commandCenter.ts", "utf8");
const policy = fs.readFileSync("functions/src/admin/commandCenterPolicy.ts", "utf8");
const nav = fs.readFileSync("public/assets/js/admin-nav.js", "utf8");
const commandCss = fs.readFileSync("public/admin/command-center/command-center.css", "utf8");
const adminCss = fs.readFileSync("public/assets/css/admin-ui.css", "utf8");

test("Command Center publishes all seven owner modules in existing Admin OS", () => {
  for (const label of [
    "Executive Overview", "Projects &amp; Roadmaps", "Development &amp; Releases",
    "Unfinished Work / Recovery Queue", "Testing &amp; Verification",
    "Approvals &amp; Decisions", "Completed Work Archive",
  ]) assert.match(html, new RegExp(label.replace(/[&]/g, "&")));
  assert.match(nav, /Command Center/);
  assert.match(html, /admin-ui\.css/);
  assert.match(html, /viewport/);
});

test("desktop and mobile navigation retain the shared responsive Admin shell", () => {
  assert.match(html, /admin-menu-toggle/);
  assert.match(html, /data-admin-nav/);
  assert.match(nav, /admin-nav-open/);
  assert.match(nav, /aria-expanded/);
  assert.match(adminCss, /@media\(max-width:800px\)/);
  assert.match(commandCss, /@media\(max-width:620px\)/);
  assert.match(commandCss, /\.cc-counters,.cc-toolbar,.cc-form-grid\{grid-template-columns:1fr\}/);
});

test("client supports creation, editing, filtering, evidence, and archival", () => {
  for (const token of ["saveProject", "openEditor", "filteredProjects", "archiveProject", "testEvidence", "renderHistory"]) {
    assert.match(client, new RegExp(token));
  }
  assert.match(service, /getCommandCenterSnapshot/);
  assert.match(service, /saveCommandCenterProject/);
  assert.match(service, /archiveCommandCenterProject/);
  assert.doesNotMatch(client, /deploy\(|firebase deploy|workflow_dispatch/);
});

test("owner authorization is enforced at UI and callable backend boundaries", () => {
  assert.match(guard, /commandCenterOwner !== true/);
  assert.match(backend, /requireOwner\(request\.auth\?\.uid\)/g);
  assert.match(backend, /permission-denied/);
  assert.match(backend, /staff\/\$\{cleanUid\}/);
  assert.match(policy, /role\) === "admin"/);
  assert.match(policy, /status\) === "active"/);
  assert.match(policy, /staff\.commandCenterOwner === true/);
});

test("backend writes persistent project history transactionally and evidence-gates completion", () => {
  assert.match(backend, /runTransaction/);
  assert.match(backend, /collection\("history"\)/);
  assert.match(backend, /tx\.create/);
  assert.match(policy, /Tested and later statuses require passing test evidence/);
  assert.match(policy, /Verified status requires passing verification evidence/);
  assert.match(policy, /Only verified work can enter the completed archive/);
});
