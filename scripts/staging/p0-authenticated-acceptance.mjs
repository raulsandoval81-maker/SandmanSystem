import { writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const project = "sandman-combat-staging";
const origin = `https://${project}.web.app`;
const firestore = `https://firestore.googleapis.com/v1/projects/${project}/databases/(default)/documents`;
const roles = {
  management: "/management/hub/",
  coach: "/coaches/",
  parent: "/parent/",
  athlete: "/athletes/hub/",
  admin: "/admin/hub/dashboard.html",
};
const checks = [];
let current = "fixture configuration";
let browser;
const athleteOnly = process.env.P0_ATHLETE_DIAGNOSTIC === "true";
const ownershipClassificationOnly = process.env.P0_OWNERSHIP_CLASSIFICATION === "true";
const athleteDiagnostics = {};

function diagnosticPath(rawUrl) {
  try {
    const url = new URL(rawUrl);
    if (url.origin === origin || url.origin === "https://www.gstatic.com") return url.pathname;
    if (url.origin === "https://firestore.googleapis.com") {
      if (url.pathname === "/google.firestore.v1.Firestore/Listen/channel") return "firestore:listen";
      const marker = "/documents/";
      const offset = url.pathname.indexOf(marker);
      return offset >= 0
        ? `firestore:${url.pathname.slice(offset + marker.length).split("/")[0]}`
        : "firestore:other";
    }
    return url.origin;
  } catch {
    return "invalid-url";
  }
}

function diagnosticError(message) {
  const value = String(message || "").toLowerCase();
  if (/permission-denied|insufficient permissions/.test(value)) return "permission-denied";
  if (/not-found|404/.test(value)) return "not-found";
  if (/timeout/.test(value)) return "timeout";
  return "runtime-error";
}


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
    // The browser SDK uses POST for the Listen forward channel and GET
    // for its backchannel. Check the exact read-only channel before REST GETs.
    if (url.pathname === "/google.firestore.v1.Firestore/Listen/channel") {
      return ["GET", "POST"].includes(method) &&
        url.searchParams.get("database") === `projects/${project}/databases/(default)`;
    }
    return ["GET", "HEAD"].includes(method) &&
      url.pathname.startsWith(`/v1/projects/${project}/databases/(default)/`);
  }
  return false;
}

function verifyReadOnlyNetworkPolicy() {
  const listen = "https://firestore.googleapis.com/google.firestore.v1.Firestore/Listen/channel";
  const write = listen.replace("/Listen/", "/Write/");
  const db = encodeURIComponent(`projects/${project}/databases/(default)`);
  const productionDb = encodeURIComponent("projects/sandmandashboard/databases/(default)");
  const stagingRest = `https://firestore.googleapis.com/v1/projects/${project}/databases/(default)/documents/synthetic/test`;
  const cases = [
    ["GET", listen + "?database=" + db, true],
    ["POST", listen + "?database=" + db, true],
    ["GET", listen + "?database=" + productionDb, false],
    ["POST", listen + "?database=" + productionDb, false],
    ["GET", listen, false],
    ["POST", write + "?database=" + db, false],
    ["GET", write + "?database=" + db, false],
    ["GET", stagingRest, true],
    ["POST", stagingRest, false],
    ["PATCH", stagingRest, false],
    ["DELETE", stagingRest, false],
    ["GET", stagingRest.replace(project, "sandmandashboard"), false],
  ];
  for (const [method, url, expected] of cases) {
    requireCheck(safeRequest({ method: () => method, url: () => url }) === expected);
  }
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
  if (athleteDiagnostics.phase === "own synthetic document read") athleteDiagnostics.ownReadHttpStatus = response.status;
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

async function openRole(role, fixture, password, athleteId) {
  const context = await browser.newContext({ serviceWorkers: "block", acceptDownloads: false });
  try {
    await context.route("**/*", (route) =>
      safeRequest(route.request()) ? route.continue() : route.abort("blockedbyclient"));
    const page = await context.newPage();
    if (role === "athlete") {
      athleteDiagnostics.browserErrors = [];
      athleteDiagnostics.failedRequests = [];
      athleteDiagnostics.firestoreReads = [];
      athleteDiagnostics.curriculumAssets = [];
      page.on("pageerror", error => athleteDiagnostics.browserErrors.push(diagnosticError(error?.message)));
      page.on("requestfailed", failed => athleteDiagnostics.failedRequests.push({
        method: failed.method(), path: diagnosticPath(failed.url()), reason: diagnosticError(failed.failure()?.errorText),
      }));
      page.on("response", response => {
        const request = response.request();
        const path = diagnosticPath(response.url());
        if (path.startsWith("firestore:")) {
          athleteDiagnostics.firestoreReads.push({ method: request.method(), path, status: response.status() });
        } else if (new URL(response.url()).origin === origin && (path === "/vault/system-status.json" ||
          path.startsWith("/vault/strength/") || path.startsWith("/vault/honor/") || path.startsWith("/vault/curriculum/"))) {
          athleteDiagnostics.curriculumAssets.push({ path, status: response.status() });
        }
      });
    }
    await page.goto(`${origin}/staging-environment.json`, { waitUntil: "domcontentloaded" });
    requireCheck(new URL(page.url()).origin === origin);
    if (role === "athlete") athleteDiagnostics.phase = "authentication";
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
    if (role === "athlete") {
      athleteDiagnostics.authentication = "verified";
      athleteDiagnostics.phase = "own synthetic document read";
      const fields = await allowed("athletes/" + athleteId, session.token);
      athleteDiagnostics.ownDocument = "allowed";
      const authUid = fields.authUid;
      athleteDiagnostics.ownership = {
        authUidState: authUid === undefined ? "missing"
          : authUid.nullValue !== undefined ? "null"
          : authUid.stringValue === session.uid ? "matching"
          : "mismatched",
        documentIdMatchesUid: athleteId === session.uid,
      };
      if (ownershipClassificationOnly) return session.token;
      const journey = String((fields.programTrack || fields.journey || fields.track || fields.trackCode)?.stringValue || "")
        .toLowerCase().replace(/[^a-z0-9]/g, "");
      athleteDiagnostics.legacyZ2H = journey === "z2h";
      athleteDiagnostics.recognizedJourney = ["road2champion","r2c","z2h","path2legend","p2l","quest2mastery","q2m"].includes(journey);
      athleteDiagnostics.phase = "hub entry";
      page.on("console", message => {
        if (message.type() === "warning" && message.text().startsWith("[Athlete Hub Router] athlete lookup failed:")) {
          athleteDiagnostics.routerLookup = /permission-denied|insufficient permissions/i.test(message.text()) ? "permission denied" : "failed";
        }
      });
      page.on("framenavigated", frame => {
        if (frame !== page.mainFrame()) return;
        const path = new URL(frame.url()).pathname;
        athleteDiagnostics.route = ["/athletes/hub/", "/athletes/hub/mini-hub.html", "/athletes/hub/full-hub.html"].includes(path) ? path : "other";
      });
    }
    const entry = origin + roles[role] + (role === "athlete" ? `?id=${encodeURIComponent(athleteId)}` : "");
    const response = await page.goto(entry, { waitUntil: "domcontentloaded" });
    requireCheck(response?.ok());
    if (role === "athlete") athleteDiagnostics.phase = "dashboard visibility";
    await page.locator(fixture.readySelector).first().waitFor({ state: "visible", timeout: 15000 });
    if (role === "athlete") {
      athleteDiagnostics.dashboardInitialization = await page.locator(fixture.readySelector).first().evaluate(element => ({
        hidden: element.hidden,
        cardCount: element.querySelectorAll(".athlete-status-card").length,
      }));
      const hub = new URL(page.url());
      requireCheck(hub.pathname === "/athletes/hub/mini-hub.html" && hub.searchParams.get("id") === athleteId);
      requireCheck(athleteId === athleteId.toLowerCase());
      const canonical = await page.evaluate(() => localStorage.getItem("sandman_lastAthleteUid"));
      requireCheck(canonical === athleteId);
      const grid = page.locator(fixture.readySelector).first();
      for (const lane of ["combat", "strength", "honor"]) {
        const link = grid.locator("a.athlete-status-card--" + lane);
        requireCheck(await link.isVisible());
        const href = new URL(await link.getAttribute("href"), origin);
        requireCheck(href.origin === origin && href.searchParams.get("id") === athleteId);
      }
      for (const lane of ["strength", "honor"]) {
        const assets = athleteDiagnostics.curriculumAssets.filter(asset =>
          asset.path.startsWith("/vault/" + lane + "/") && asset.status >= 200 && asset.status < 300);
        requireCheck(assets.some(asset => asset.path.endsWith("/sessions.json")));
        requireCheck(assets.some(asset => asset.path.endsWith(".meta.json")));
      }
      athleteDiagnostics.phase = "dashboard session";
    }
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
  current = "read-only network policy regression";
  verifyReadOnlyNetworkPolicy();
  passed(current);
  current = "fixture configuration";
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
  current = "staging runtime isolation";
  const marker = await request(origin + "/staging-environment.json");
  requireCheck(marker.status === 200);
  const environment = await marker.json();
  requireCheck(environment.projectId === project && environment.syntheticDataOnly === true);
  passed(current);
  const { chromium } = await import(pathToFileURL(process.env.P0_PLAYWRIGHT).href);
  browser = await chromium.launch({ headless: true });
  const tokens = {};
  for (const role of (athleteOnly || ownershipClassificationOnly) ? ["athlete"] : Object.keys(roles)) {
    current = role + " authenticated operating system";
    tokens[role] = await openRole(role, fixtures.roles[role], password, fixtures.ownAthlete);
    passed(current);
  }

  if (athleteOnly || ownershipClassificationOnly) return;
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


}

try {
  await run();
} catch {
  checks.push({ check: current, status: "STOP_NO_RETRY" });
  process.exitCode = 1;
} finally {
  await browser?.close().catch(() => {});
  const scope = ownershipClassificationOnly ? "athlete ownership classification"
    : athleteOnly ? "athlete diagnostic" : "full acceptance";
  const result = { project, status: process.exitCode ? "STOP_NO_RETRY" : "PASS", scope, storage: "PENDING", athleteDiagnostics, checks };
  writeFileSync("p0-acceptance-results.json", JSON.stringify(result, null, 2) + "\n");
  console.log(JSON.stringify(result));
}
