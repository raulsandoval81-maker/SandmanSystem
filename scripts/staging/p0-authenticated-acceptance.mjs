import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const project = "sandman-combat-staging";
const origin = `https://${project}.web.app`;
const bucket = `${project}.firebasestorage.app`;
const firestore = `https://firestore.googleapis.com/v1/projects/${project}/databases/(default)/documents`;
const roles = {
  management: "/management/hub/",
  coach: "/coaches/",
  parent: "/parent/",
  athlete: "/athletes/hub/",
  admin: "/admin/",
};
const checks = [];
let current = "fixture configuration";
let browser;

function requireCheck(value) {
  if (!value) throw new Error("Acceptance assertion failed");
}

function passed(name) {
  checks.push({ check: name, status: "PASS" });
}

function id(value) {
  requireCheck(typeof value === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(value));
  return value;
}

function safeRequest(request) {
  const url = new URL(request.url());
  const method = request.method();
  if (url.origin === origin) return ["GET", "HEAD"].includes(method);
  if (url.origin === "https://www.gstatic.com") return method === "GET";
  if (url.origin === "https://identitytoolkit.googleapis.com") {
    return method === "POST" && [
      "/v1/accounts:signInWithPassword", "/v1/accounts:lookup",
    ].includes(url.pathname);
  }
  if (url.origin === "https://securetoken.googleapis.com") {
    return method === "POST" && url.pathname === "/v1/token";
  }
  if (url.origin === "https://firestore.googleapis.com") {
    if (["GET", "HEAD"].includes(method)) {
      return url.pathname.startsWith(`/v1/projects/${project}/databases/(default)/`);
    }
    return ["GET", "POST"].includes(method) &&
      url.pathname === "/google.firestore.v1.Firestore/Listen/channel" &&
      url.searchParams.get("database") === `projects/${project}/databases/(default)`;
  }
  return false;
}

async function request(url, token, scheme = "Bearer") {
  return fetch(url, {
    redirect: "error",
    signal: AbortSignal.timeout(12000),
    headers: token ? { Authorization: `${scheme} ${token}` } : {},
  });
}

async function readDocument(path, token) {
  return request(`${firestore}/${path}`, token);
}

async function allowed(path, token) {
  const response = await readDocument(path, token);
  requireCheck(response.status === 200);
  const document = await response.json();
  const fields = document.fields ?? {};
  requireCheck(document.name?.endsWith(`/documents/${path}`));
  requireCheck(fields.synthetic?.booleanValue === true);
  return fields;
}

async function denied(path, token) {
  requireCheck((await readDocument(path, token)).status === 403);
}

async function openRole(role, fixture, password) {
  const context = await browser.newContext({ serviceWorkers: "block", acceptDownloads: false });
  try {
    await context.route("**/*", (route) =>
      safeRequest(route.request()) ? route.continue() : route.abort("blockedbyclient"));
    const page = await context.newPage();
    await page.goto(`${origin}/staging-environment.json`, { waitUntil: "domcontentloaded" });
    requireCheck(new URL(page.url()).origin === origin);
    const session = await page.evaluate(async ({ email, password, project }) => {
      const { auth } = await import("/assets/js/firebase-init.js");
      const { signInWithEmailAndPassword } = await import(
        "https://www.gstatic.com/firebasejs/10.13.1/firebase-auth.js"
      );
      if (auth.app.options.projectId !== project) return null;
      const { user } = await signInWithEmailAndPassword(auth, email, password);
      const result = await user.getIdTokenResult();
      return { uid: user.uid, token: result.token, synthetic: result.claims.synthetic === true,
        audience: result.claims.aud };
    }, { email: fixture.email, password, project });
    requireCheck(session?.synthetic && session.audience === project && session.uid === fixture.uid);
    const response = await page.goto(origin + roles[role], { waitUntil: "domcontentloaded" });
    requireCheck(response?.ok());
    await page.locator(fixture.readySelector).first().waitFor({ state: "visible", timeout: 15000 });
    const active = await page.evaluate(async () => {
      const { auth } = await import("/assets/js/firebase-init.js");
      await auth.authStateReady();
      return { uid: auth.currentUser?.uid, projectId: auth.app.options.projectId };
    });
    requireCheck(new URL(page.url()).origin === origin && active.uid === fixture.uid && active.projectId === project);
    requireCheck(!/\/(auth|login)(\/|$)/i.test(new URL(page.url()).pathname));
    return session.token;
  } finally {
    await context.close();
  }
}

async function run() {
  const fixtures = JSON.parse(process.env.P0_STAGING_FIXTURES || "{}");
  const password = process.env.P0_STAGING_PASSWORD;
  requireCheck(typeof password === "string" && password.length >= 12);
  const uids = Object.keys(roles).map((role) => {
    const fixture = fixtures.roles?.[role];
    requireCheck(/^staging-/.test(fixture?.uid ?? "") &&
      /^[^@\s]+@example\.(com|org|net|invalid)$/.test(fixture.email) &&
      typeof fixture.readySelector === "string" && fixture.readySelector.length > 0);
    return id(fixture.uid);
  });
  requireCheck(new Set(uids).size === uids.length);
  for (const key of ["ownAthlete", "otherAthlete", "intake", "proposal", "xpLog"]) {
    requireCheck(id(fixtures[key]).startsWith("staging-"));
  }
  requireCheck(fixtures.ownAthlete !== fixtures.otherAthlete);
  requireCheck(typeof fixtures.progressionField === "string" &&
    ["tier", "rank", "stripeCount", "progression"].includes(fixtures.progressionField));
  requireCheck(/^p0-synthetic\/[A-Za-z0-9_-]+\.txt$/.test(fixtures.storage?.path ?? "") &&
    Object.hasOwn(roles, fixtures.storage?.role) && /^[a-f0-9]{64}$/.test(fixtures.storage?.sha256 ?? ""));

  current = "staging runtime isolation";
  const marker = await request(origin + "/staging-environment.json");
  requireCheck(marker.status === 200);
  const environment = await marker.json();
  requireCheck(environment.projectId === project && environment.syntheticDataOnly === true);
  passed(current);
  const { chromium } = await import(pathToFileURL(process.env.P0_PLAYWRIGHT).href);
  browser = await chromium.launch({ headless: true });
  const tokens = {};
  for (const role of Object.keys(roles)) {
    current = role + " authenticated operating system";
    tokens[role] = await openRole(role, fixtures.roles[role], password);
    passed(current);
  }

  const own = `athletes/${fixtures.ownAthlete}`;
  const other = `athletes/${fixtures.otherAthlete}`;
  current = "synthetic athlete and staff scope";
  for (const [role, allowedRoles] of Object.entries({
    management: ["management", "manager", "location_manager"],
    coach: ["coach"],
    admin: ["admin", "system_admin"],
  })) {
    const staff = await allowed(`staff/${fixtures.roles[role].uid}`, tokens[role]);
    requireCheck(allowedRoles.includes(staff.role?.stringValue) && staff.status?.stringValue === "active");
  }
  const athlete = await allowed(own, tokens.athlete);
  requireCheck(fixtures.ownAthlete === fixtures.roles.athlete.uid ||
    athlete.authUid?.stringValue === fixtures.roles.athlete.uid);
  await allowed(own, tokens.coach);
  await allowed(own, tokens.management);
  await allowed(other, tokens.admin);
  passed(current);

  current = "linked parent and cross-family denial";
  await allowed(own, tokens.parent);
  await denied(other, tokens.parent);
  await denied(other, tokens.athlete);
  await denied(own);
  passed(current);

  current = "enrollment and billing fixtures";
  const intake = await allowed(`intakes/${fixtures.intake}`, tokens.management);
  const proposal = await allowed(`proposals/${fixtures.proposal}`, tokens.management);
  requireCheck(intake.proposalId?.stringValue === fixtures.proposal &&
    intake.status?.stringValue === fixtures.intakeStatus &&
    proposal.status?.stringValue === fixtures.proposalStatus &&
    proposal.paymentStatus?.stringValue === fixtures.paymentStatus &&
    [fixtures.intakeStatus, fixtures.proposalStatus, fixtures.paymentStatus]
      .every((value) => typeof value === "string" && value.length > 0));
  await denied(`proposals/${fixtures.proposal}`, tokens.athlete);
  passed(current);

  current = "XP and progression fixture access";
  const xp = await allowed(`${own}/xpLogs/${fixtures.xpLog}`, tokens.admin);
  requireCheck((xp.xp?.integerValue !== undefined || xp.xp?.doubleValue !== undefined) &&
    athlete[fixtures.progressionField] !== undefined);
  await denied(`${own}/xpLogs/${fixtures.xpLog}`, tokens.parent);
  passed(current);

  current = "authorized staging Storage download and public denial";
  const storage = `https://firebasestorage.googleapis.com/v0/b/${bucket}/o/${encodeURIComponent(fixtures.storage.path)}?alt=media`;
  const file = await request(storage, tokens[fixtures.storage.role], "Firebase");
  requireCheck(file.status === 200);
  const reader = file.body.getReader();
  const hash = createHash("sha256");
  let bytes = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.length;
    requireCheck(bytes <= 4096);
    hash.update(value);
  }
  requireCheck(bytes > 0 && hash.digest("hex") === fixtures.storage.sha256);
  requireCheck([401, 403].includes((await request(storage)).status));
  passed(current);
}

try {
  await run();
} catch {
  checks.push({ check: current, status: "STOP_NO_RETRY" });
  process.exitCode = 1;
} finally {
  await browser?.close().catch(() => {});
  const result = { project, status: process.exitCode ? "STOP_NO_RETRY" : "PASS", checks };
  writeFileSync("p0-acceptance-results.json", JSON.stringify(result, null, 2) + "\n");
  console.log(JSON.stringify(result));
}
