import { writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
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
const sprint1Acceptance = process.env.P0_SPRINT1_CHECKS === "true";
const athleteOnly = process.env.P0_ATHLETE_DIAGNOSTIC === "true";
const ownershipClassificationOnly = process.env.P0_OWNERSHIP_CLASSIFICATION === "true";
const dependencyDiagnosticOnly = process.env.P0_DEPENDENCY_DIAGNOSTIC === "true";
const navigationDiagnosticOnly = process.env.P0_NAVIGATION_DIAGNOSTIC === "true";
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

async function navigationCheckpoint(page, expectedAthleteId) {
  return page.evaluate(async expectedId => {
    const checkpoint = {
      path: location.pathname,
      idMatches: new URLSearchParams(location.search).get("id") === expectedId,
      readyState: document.readyState,
      remembered: localStorage.getItem("sandman_lastAthleteUid") === expectedId ? "exact"
        : localStorage.getItem("sandman_lastAthleteUid") == null ? "empty" : "other",
      grid: null,
      auth: "unknown",
    };
    const grid = document.getElementById("athleteStatusGrid");
    if (grid) checkpoint.grid = {
      hidden: grid.hidden,
      cardCount: grid.querySelectorAll(".athlete-status-card").length,
    };
    try {
      const { auth } = await import("/assets/js/firebase-init.js");
      await Promise.race([auth.authStateReady(), new Promise(resolve => setTimeout(resolve, 1500))]);
      checkpoint.auth = auth.currentUser?.uid === expectedId ? "restored" : auth.currentUser ? "other" : "missing";
    } catch {
      checkpoint.auth = "module-error";
    }
    return checkpoint;
  }, expectedAthleteId);
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
  if (sprint1Acceptance &&
      url.origin === `https://us-central1-${project}.cloudfunctions.net`) {
    return ["POST", "OPTIONS"].includes(method) &&
      ["/getAthleteProfileFeed", "/getAthleteSkillsSummary"].includes(url.pathname);
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
    ["POST", `https://us-central1-${project}.cloudfunctions.net/getAthleteProfileFeed`, sprint1Acceptance],
    ["POST", `https://us-central1-${project}.cloudfunctions.net/getAthleteSkillsSummary`, sprint1Acceptance],
    ["POST", `https://us-central1-${project}.cloudfunctions.net/approveAndActivate`, false],
    ["POST", "https://us-central1-sandmandashboard.cloudfunctions.net/getAthleteProfileFeed", false],
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

async function assertSprint1Callable(name, token, athleteId, allowedRole) {
  requireCheck(["getAthleteProfileFeed", "getAthleteSkillsSummary"].includes(name));
  const payload = name === "getAthleteProfileFeed"
    ? { athleteId, authorizeOnly: true }
    : { athleteId, discipline: "wrestling" };
  const response = await fetch(
    `https://us-central1-${project}.cloudfunctions.net/${name}`, {
      method: "POST",
      redirect: "error",
      signal: AbortSignal.timeout(20000),
      headers: {
        "Content-Type": "application/json",
        Origin: origin,
        ...(token ? { Authorization: "Bearer " + token } : {}),
      },
      body: JSON.stringify({ data: payload }),
    },
  );
  const body = await response.json();
  if (allowedRole) {
    requireCheck(response.status === 200);
    const result = body.result;
    requireCheck(result?.athleteId === athleteId);
    if (name === "getAthleteProfileFeed") requireCheck(result.authorized === true);
    else requireCheck(result.ok === true && result.discipline === "wrestling"
      && Array.isArray(result.skills));
  } else {
    requireCheck(response.status === (token ? 403 : 401));
    requireCheck(body.error?.status === (token ? "PERMISSION_DENIED" : "UNAUTHENTICATED"));
  }
}

async function readDocument(path, token) {
  return request(`${firestore}/${path}`, token);
}

async function dependencyDiagnostics(athleteId, token) {
  const status = async (path) => (await readDocument(path, token)).status;
  const laneHistory = await fetch(`${firestore}:runQuery`, {
    method: "POST", redirect: "error", signal: AbortSignal.timeout(12000),
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ structuredQuery: {
      from: [{ collectionId: "laneHistory" }],
      where: { fieldFilter: { field: { fieldPath: "athleteId" }, op: "EQUAL",
        value: { stringValue: athleteId } } },
      limit: 5,
    } }),
  });
  const assetHashes = {};
  for (const path of ["/assets/js/athlete-dashboard-data.js", "/assets/js/athlete-self-context.js"]) {
    const response = await request(origin + path);
    const bytes = Buffer.from(await response.arrayBuffer());
    assetHashes[path] = { status: response.status,
      sha256: createHash("sha256").update(bytes).digest("hex") };
  }
  return {
    athlete: await status(`athletes/${athleteId}`),
    laneSubmissions: await status(`laneSubmissions/${athleteId}`),
    strengthPhaseSettings: await status("strengthPhaseSettings/system"),
    laneHistory: laneHistory.status,
    assets: assetHashes,
  };
}

async function browserDependencyDiagnostics(page, athleteId) {
  return page.evaluate(async (expectedAthleteId) => {
    const normalizeError = error => {
      const value = String(error?.code || error?.message || "").toLowerCase();
      if (value.includes("permission-denied") || value.includes("insufficient permissions")) return "permission-denied";
      if (value.includes("not-found")) return "not-found";
      return "runtime-error";
    };
    const probe = async operation => {
      try {
        await operation();
        return { ok: true };
      } catch (error) {
        return { ok: false, error: normalizeError(error) };
      }
    };
    const remembered = localStorage.getItem("sandman_lastAthleteUid");
    const dashboard = await import("/assets/js/athlete-dashboard-data.js");
    const firebase = await import("/assets/js/firebase-init.js");
    let resolved;
    const resolver = await probe(async () => {
      resolved = await dashboard.resolveSignedInAthlete(expectedAthleteId);
      if (resolved?.athleteId !== expectedAthleteId) throw new Error("resolver-id-mismatch");
    });
    const sdk = {
      laneSubmissions: await probe(() => firebase.getDoc(
        firebase.doc(firebase.db, "laneSubmissions", expectedAthleteId))),
      strengthPhaseSettings: await probe(() => firebase.getDoc(
        firebase.doc(firebase.db, "strengthPhaseSettings", "system"))),
      laneHistory: await probe(() => firebase.getDocs(firebase.query(
        firebase.collection(firebase.db, "laneHistory"),
        firebase.where("athleteId", "==", expectedAthleteId)))),
    };
    const dashboardInitialization = resolver.ok
      ? await probe(() => dashboard.loadAthleteDashboard({
          athleteId: resolved.athleteId, athlete: resolved.athlete,
        }))
      : { ok: false, error: "resolver-failed" };
    return {
      initialRememberedId: remembered == null ? "empty"
        : remembered === remembered.toUpperCase() ? "uppercase" : "other",
      resolver,
      resolvedExactId: resolved?.athleteId === expectedAthleteId,
      sdk,
      dashboardInitialization,
    };
  }, athleteId);
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

async function signInSynthetic(page, fixture, password) {
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
  return session;
}

async function verifyAthleteNavigationOwnership(page, ownId, otherId, otherMarkers) {
  current = "athlete ownership drawer";
  await page.evaluate(otherId => {
    localStorage.setItem("currentAthleteId", otherId);
    sessionStorage.setItem("currentAthleteId", otherId);
  }, otherId);
  await page.locator(".athlete-menu-button").click();
  const profileLink = page.locator('#athleteDrawer a[href^="/athletes/profile/"]');
  const profile = new URL(await profileLink.getAttribute("href"), origin);
  requireCheck(profile.origin === origin && profile.searchParams.get("id") === ownId);
  await profileLink.click();
  await page.waitForURL(url => url.origin === origin && url.pathname.startsWith("/athletes/profile/"));
  passed(current);

  const cases = [
    ["/athletes/hub/", "id"],
    ["/athletes/hub/mini-hub.html", "id"],
    ["/athletes/hub/full-hub.html", "id"],
    ["/athletes/profile/", "athleteId"],
    ["/athletes/arsenal/", "uid"],
    ["/athletes/profile/", null],
    ["/athletes/arsenal/", null],
  ];
  for (const [path, parameter] of cases) {
    current = "athlete ownership navigation " + path + " " + (parameter || "browser storage");
    await page.evaluate(({ otherId, poison }) => {
      if (!poison) return;
      for (const key of ["sandman_lastAthleteUid", "currentAthleteId"]) {
        localStorage.setItem(key, otherId);
        sessionStorage.setItem(key, otherId);
      }
    }, { otherId, poison: !parameter });
    const target = new URL(path, origin);
    if (parameter) target.searchParams.set(parameter, otherId);
    requireCheck((await page.goto(target.href, { waitUntil: "load" }))?.ok());
    // Wait for ownership resolution or an explicit terminal page before evaluating.
    await page.waitForFunction(({ origin, ownId, otherId }) => {
      if (location.origin !== origin) return true;
      if (/\/(auth|login)(\/|$)/i.test(location.pathname)) return true;
      const query = new URLSearchParams(location.search);
      const requested = ["id", "athleteId", "uid"].map(key => query.get(key));
      const text = document.body.innerText;
      return (requested.includes(ownId) && !requested.includes(otherId) &&
        !/\/(hub|profile|arsenal)\/$/.test(location.pathname)) ||
        /athlete not found|account mismatch|unable to determine athlete journey|not authorized|access denied/i.test(text);
    }, { origin, ownId, otherId }, { timeout: 15000 });
    const state = await page.evaluate(({ otherId, otherMarkers }) => ({
      origin: location.origin,
      pathsLeak: [...document.querySelectorAll("#athleteDrawer a[href]")].some(link =>
        ["id", "athleteId", "uid"].some(key => new URL(link.href).searchParams.get(key) === otherId)),
      detailsLeak: otherMarkers.some(marker => document.body.innerText.includes(marker)),
      rememberedOther: ["sandman_lastAthleteUid", "currentAthleteId"].some(key =>
        localStorage.getItem(key) === otherId || sessionStorage.getItem(key) === otherId),
    }), { otherId, otherMarkers });
    requireCheck(state.origin === origin && !state.pathsLeak && !state.detailsLeak && !state.rememberedOther);
    passed(current);
  }
}

async function openRole(role, fixture, password, athleteId, ownershipCase) {
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
      athleteDiagnostics.consoleErrors = [];
      page.on("pageerror", error => athleteDiagnostics.browserErrors.push(diagnosticError(error?.message)));
      page.on("console", message => {
        if (["error", "warning"].includes(message.type())) {
          athleteDiagnostics.consoleErrors.push(diagnosticError(message.text()));
        }
      });
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
    if (role === "athlete") athleteDiagnostics.phase = "authentication";
    const session = await signInSynthetic(page, fixture, password);
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
      if (dependencyDiagnosticOnly) {
        athleteDiagnostics.dependencies = await dependencyDiagnostics(athleteId, session.token);
        athleteDiagnostics.browserDependencies = await browserDependencyDiagnostics(page, athleteId);
        return session.token;
      }
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
    if (role === "athlete" && navigationDiagnosticOnly) {
      athleteDiagnostics.navigation = [];
      for (let attempt = 0; attempt < 20; attempt += 1) {
        const checkpoint = await navigationCheckpoint(page, athleteId);
        athleteDiagnostics.navigation.push(checkpoint);
        if ((checkpoint.grid && !checkpoint.grid.hidden && checkpoint.grid.cardCount >= 3)
          || /\/(auth|login)(\/|$)/i.test(checkpoint.path)) break;
        await page.waitForTimeout(500);
      }
      const final = athleteDiagnostics.navigation.at(-1);
      const rendered = final?.grid?.hidden === false && final.grid.cardCount >= 3 &&
        final.idMatches && final.auth === "restored" &&
        final.path === "/athletes/hub/mini-hub.html";
      athleteDiagnostics.navigationResult = rendered ? "rendered" : "not-rendered";
      current = "athlete navigation rendered authenticated Home Base";
      requireCheck(rendered);
      return session.token;
    }
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
    if (ownershipCase) {
      await verifyAthleteNavigationOwnership(page, athleteId, ownershipCase.otherId, ownershipCase.markers);
    }
    return session.token;
  } finally {
    await context.close();
  }
}

async function run() {
  if (sprint1Acceptance) {
    requireCheck(!athleteOnly && !ownershipClassificationOnly &&
      !dependencyDiagnosticOnly && !navigationDiagnosticOnly);
  }
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
  for (const role of (athleteOnly || ownershipClassificationOnly || dependencyDiagnosticOnly || navigationDiagnosticOnly) ? ["athlete"] : Object.keys(roles)) {
    current = role + " authenticated operating system";
    tokens[role] = await openRole(role, fixtures.roles[role], password, fixtures.ownAthlete);
    passed(current);
  }

  if (athleteOnly || ownershipClassificationOnly || dependencyDiagnosticOnly || navigationDiagnosticOnly) return;
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

  if (sprint1Acceptance) {
    current = "Sprint 1 protected Profile and Skills callables — synthetic authenticated roles";
    for (const name of ["getAthleteProfileFeed", "getAthleteSkillsSummary"]) {
      for (const role of ["athlete", "parent", "coach", "management", "admin"]) {
        await assertSprint1Callable(name, tokens[role], fixtures.ownAthlete, true);
      }
      await assertSprint1Callable(name, tokens.admin, fixtures.otherAthlete, true);
      for (const role of ["athlete", "parent", "coach", "management"]) {
        await assertSprint1Callable(name, tokens[role], fixtures.otherAthlete, false);
      }
      await assertSprint1Callable(name, null, fixtures.ownAthlete, false);
    }
    passed(current);
  }

  current = "linked parent and cross-family denial";
  await allowed(own, tokens.parent);
  await denied(other, tokens.parent);
  passed(current);

  current = "unrelated signed-in Athlete and unsigned account denial";
  await denied(other, tokens.athlete);
  await denied(own);
  passed(current);

  current = "out-of-scope synthetic Coach";
  const outsider = { uid: "staging-outsider-coach", email: "coach.outsider@example.invalid" };
  requireCheck(!uids.includes(outsider.uid));
  const context = await browser.newContext({ serviceWorkers: "block", acceptDownloads: false });
  try {
    await context.route("**/*", route =>
      safeRequest(route.request()) ? route.continue() : route.abort("blockedbyclient"));
    const session = await signInSynthetic(await context.newPage(), outsider, password);
    const staff = await allowed(`staff/${outsider.uid}`, session.token);
    requireCheck(staff.role?.stringValue === "coach" && staff.status?.stringValue === "active");
    await denied(own, session.token);
    await denied(other, session.token);
  } finally {
    await context.close();
  }
  passed(current);

  current = "cross-athlete synthetic marker preparation";
  const otherFields = await allowed(other, tokens.admin);
  const markers = [...new Set(["name", "displayName", "fullName"]
    .map(key => otherFields[key]?.stringValue)
    .filter(value => typeof value === "string" && value.length >= 6))];
  requireCheck(markers.length > 0 && markers.every(marker =>
    !["name", "displayName", "fullName"].some(key => athlete[key]?.stringValue === marker)));
  await openRole("athlete", fixtures.roles.athlete, password, fixtures.ownAthlete,
    { otherId: fixtures.otherAthlete, markers });

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
  const scope = navigationDiagnosticOnly ? "athlete navigation diagnostic"
    : dependencyDiagnosticOnly ? "athlete dependency diagnostic"
    : ownershipClassificationOnly ? "athlete ownership classification"
    : athleteOnly ? "athlete diagnostic" : "full acceptance";
  const result = { project, status: process.exitCode ? "STOP_NO_RETRY" : "PASS", scope, storage: "PENDING", athleteDiagnostics, checks };
  writeFileSync("p0-acceptance-results.json", JSON.stringify(result, null, 2) + "\n");
  console.log(JSON.stringify(result));
}
