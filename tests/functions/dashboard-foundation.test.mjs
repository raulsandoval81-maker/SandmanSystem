import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";

import { resolveAuthenticatedAthlete } from "../../public/assets/js/athlete-self-context.js";
import { classifyCoachAthleteScope, scopeCoachRoster } from "../../public/assets/js/coach-roster-scope.js";
import { combatDashboardModel, coachLaneRowModel, laneDashboardModel } from "../../public/assets/js/lane-dashboard-state.js";

const sessions = [1, 2, 3, 4].map((n) => ({ id: `STR-${String(n).padStart(3, "0")}`, n }));

test("Athlete resolution rejects an unrelated requested id and uses the sole auth-owned record", async () => {
  const records = {
    OTHER: { authUid: "someone-else" },
    MINE: { authUid: "auth-one", fullName: "Mine" },
  };
  const result = await resolveAuthenticatedAthlete({
    user: { uid: "auth-one" }, requestedId: "other", rememberedId: "",
    getAthleteById: async (id) => records[id] || null,
    findAthletesByAuthUid: async () => [{ athleteId: "MINE", athlete: records.MINE }],
  });
  assert.equal(result.athleteId, "MINE");
  assert.deepEqual(result.rejectedIds, ["OTHER"]);
});

test("Athlete resolution fails closed for multiple auth-owned records", async () => {
  const result = await resolveAuthenticatedAthlete({
    user: { uid: "auth-one" }, getAthleteById: async () => null,
    findAthletesByAuthUid: async () => [
      { athleteId: "A", athlete: { authUid: "auth-one" } },
      { athleteId: "B", athlete: { authUid: "auth-one" } },
    ],
  });
  assert.equal(result.athleteId, "");
  assert.equal(result.ambiguous, true);
});

test("Athlete resolution preserves case-sensitive Firestore document ids", async () => {
  const athleteId = "staging-athlete-beginner";
  const athlete = { authUid: athleteId, programTrack: "z2h" };
  const direct = await resolveAuthenticatedAthlete({
    user: { uid: athleteId },
    requestedId: athleteId,
    getAthleteById: async (id) => id === athleteId ? athlete : null,
    findAthletesByAuthUid: async () => [],
  });
  assert.equal(direct.athleteId, athleteId);

  const queried = await resolveAuthenticatedAthlete({
    user: { uid: athleteId },
    requestedId: "missing",
    getAthleteById: async () => null,
    findAthletesByAuthUid: async () => [{ athleteId, athlete }],
  });
  assert.equal(queried.athleteId, athleteId);
});

test("Athlete resolution follows authUid and exact document-id ownership", async () => {
  const uid = "staging-athlete-beginner";
  for (const [label, athlete, expected] of [
    ["missing", {}, uid],
    ["null", { authUid: null }, uid],
    ["matching", { authUid: uid }, uid],
    ["mismatched", { authUid: "different-user" }, ""],
  ]) {
    const result = await resolveAuthenticatedAthlete({
      user: { uid }, requestedId: uid,
      getAthleteById: async id => id === uid ? athlete : null,
      findAthletesByAuthUid: async () => [],
    });
    assert.equal(result.athleteId, expected, label);
  }
});

test("uppercase fallback preserves canonical ids without bypassing ownership", async () => {
  const canonical = "ATHLETE_001";
  const accepted = await resolveAuthenticatedAthlete({
    user: { uid: canonical }, requestedId: "athlete_001",
    getAthleteById: async id => id === canonical ? { authUid: null } : null,
    findAthletesByAuthUid: async () => [],
  });
  assert.equal(accepted.athleteId, canonical);

  const rejected = await resolveAuthenticatedAthlete({
    user: { uid: canonical }, requestedId: "athlete_001",
    getAthleteById: async id => id === canonical ? { authUid: "different-user" } : null,
    findAthletesByAuthUid: async () => [],
  });
  assert.equal(rejected.athleteId, "");
});

test("legacy Z2H routing remains on the mini Athlete hub", () => {
  const router = fs.readFileSync("public/athletes/hub/index.html", "utf8");
  const miniHub = fs.readFileSync("public/athletes/hub/mini-hub.html", "utf8");
  assert.match(router, /journey === "z2h"/);
  assert.match(miniHub, /journey === "z2h"/);
});

test("staging acceptance records sanitized Athlete dependency diagnostics", () => {
  const source = fs.readFileSync("scripts/staging/p0-authenticated-acceptance.mjs", "utf8");
  assert.match(source, /browserErrors/);
  assert.match(source, /failedRequests/);
  assert.match(source, /firestoreReads/);
  assert.match(source, /curriculumAssets/);
  assert.match(source, /dashboardInitialization/);
  assert.doesNotMatch(source, /athleteDiagnostics\.(?:browserErrors|failedRequests).*token/);
});

test("staging ownership classification distinguishes all authUid states", () => {
  const source = fs.readFileSync("scripts/staging/p0-authenticated-acceptance.mjs", "utf8");
  assert.match(source, /authUid === undefined \? "missing"/);
  assert.match(source, /authUid\.nullValue !== undefined \? "null"/);
  assert.match(source, /authUid\.stringValue === session\.uid \? "matching"/);
  assert.match(source, /: "mismatched"/);
  assert.match(source, /documentIdMatchesUid: athleteId === session\.uid/);
});

test("Combat dashboard uses stored rank, XP, and cap without Profile or Coins", () => {
  assert.deepEqual(combatDashboardModel({ rankName: "Competitor", xp: 1240, xpCap: 2400 }), {
    rank: "Competitor", xp: 1240, cap: 2400,
  });
});

test("Shared lane dashboard exposes active, incomplete, pending, revision, waiting, and content missing", () => {
  const base = { lane: "strength", segmentId: "segment1", sessions, athlete: { xpStrength: 320 }, now: "2026-01-09T20:00:00Z" };
  assert.equal(laneDashboardModel({ ...base, submissions: {} }).status, "active");
  assert.equal(laneDashboardModel({ ...base, submissions: { "STR-001": { lane: "strength", segmentId: "segment1", sessionN: 1, status: "draft" } } }).status, "incomplete");
  assert.equal(laneDashboardModel({ ...base, submissions: { "STR-001": { lane: "strength", segmentId: "segment1", sessionN: 1, status: "pending" } } }).status, "pending");
  assert.equal(laneDashboardModel({ ...base, submissions: { "STR-001": { lane: "strength", segmentId: "segment1", sessionN: 1, status: "needs_revision" } } }).status, "revision");
  const completed = { "STR-001": { lane: "strength", segmentId: "segment1", sessionN: 1, status: "closed", closedAt: "2026-01-09T17:00:00Z" } };
  assert.equal(laneDashboardModel({ ...base, submissions: completed, now: "2026-01-09T18:00:00Z" }).status, "waiting");
  assert.equal(laneDashboardModel({ ...base, sessions: sessions.slice(0, 1), submissions: completed, now: "2026-01-20T18:00:00Z" }).status, "content-missing");
});

test("Strength and Honor card context and XP stay lane-specific", () => {
  const strength = laneDashboardModel({ lane: "strength", segmentId: "segment1", sessions, submissions: {}, athlete: { xpStrength: 320 }, phase: "inseason" });
  const honor = laneDashboardModel({ lane: "honor", segmentId: "segment2", sessions, submissions: {}, athlete: { xpHonor: 185 }, category: "teammates" });
  assert.equal(strength.phase, "inseason");
  assert.equal(strength.xp, 320);
  assert.equal(honor.category, "teammates");
  assert.equal(honor.xp, 185);
  assert.equal(coachLaneRowModel({ athleteId: "A", athlete: { fullName: "Jordan" }, strength, honor }).action, "none");
});

test("identical segment/session identities remain isolated by lane", () => {
  const old = "2026-01-01T18:00:00Z";
  const honorOnly = Object.fromEntries(Array.from({ length: 39 }, (_, index) => {
    const sessionN = index + 1;
    return [`HON-${String(sessionN).padStart(3, "0")}`, {
      lane: "honor", segmentId: "segment1", sessionN, status: "closed", closedAt: old,
    }];
  }));
  const strengthFromHonor = laneDashboardModel({
    lane: "strength", segmentId: "segment1", sessions, submissions: honorOnly,
    now: "2026-02-01T18:00:00Z",
  });
  assert.equal(strengthFromHonor.missionN, 1);
  assert.equal(strengthFromHonor.status, "active");

  const strengthOnly = {
    "STR-001": { lane: "strength", segmentId: "segment1", sessionN: 1, status: "closed", closedAt: old },
  };
  const honorFromStrength = laneDashboardModel({
    lane: "honor", segmentId: "segment1", sessions, submissions: strengthOnly,
    now: "2026-02-01T18:00:00Z",
  });
  assert.equal(honorFromStrength.missionN, 1);
  assert.equal(honorFromStrength.status, "active");

  const sameSession = {
    "STR-001": { lane: "strength", segmentId: "segment1", sessionN: 1, status: "pending" },
    "HON-001": { lane: "honor", segmentId: "segment1", sessionN: 1, status: "needs_revision" },
  };
  assert.equal(laneDashboardModel({ lane: "strength", segmentId: "segment1", sessions, submissions: sameSession }).status, "pending");
  assert.equal(laneDashboardModel({ lane: "honor", segmentId: "segment1", sessions, submissions: sameSession }).status, "revision");
});

test("Coach scope supports location, multiple locations, assignment, Admin, and explicit legacy output", () => {
  const coach = { uid: "coach-1", scope: { locationIds: ["lompoc", "elk-grove"] } };
  assert.equal(classifyCoachAthleteScope(coach, { locationId: "elk-grove" }).included, true);
  assert.equal(classifyCoachAthleteScope(coach, { coachIds: ["coach-1"] }).reason, "coach-assignment");
  assert.equal(classifyCoachAthleteScope({ isSystemAdmin: true }, {}).reason, "admin");
  const scoped = scopeCoachRoster(coach, [
    { athleteId: "LOCAL", athlete: { locationId: "lompoc" } },
    { athleteId: "REMOTE", athlete: { locationId: "santa-ynez-valley" } },
    { athleteId: "LEGACY", athlete: {} },
  ]);
  assert.deepEqual(scoped.athletes.map((row) => row.athleteId), ["LOCAL"]);
  assert.deepEqual(scoped.unassigned.map((row) => row.athleteId), ["LEGACY"]);
});

test("Both Athlete hubs use the same authoritative resolver and lightweight model", () => {
  for (const file of ["public/athletes/hub/full-hub.html", "public/athletes/hub/mini-hub.html"]) {
    const source = fs.readFileSync(file, "utf8");
    assert.match(source, /resolveSignedInAthlete/);
    assert.match(source, /loadAthleteDashboard/);
    assert.match(source, /athleteStatusGrid/);
    assert.doesNotMatch(source, /Coins/);
  }
});

test("mini hub initializes the dashboard from the lowercase URL document ID", async () => {
  const id = "staging-athlete-beginner";
  const athlete = { journey: "Z2H" };
  const elements = new Map();
  const reads = [];
  const html = fs.readFileSync("public/athletes/hub/mini-hub.html", "utf8");
  const module = html.match(/<script type="module">([\s\S]*?)<\/script>/)[1];
  const entry = module.replace(/import\s*\{[^}]*\}\s*from\s*"[^"]+";/g, "");
  const grid = { hidden: true };
  elements.set("athleteStatusGrid", grid);
  await runInNewContext(entry, {
    URLSearchParams, location: { search: "?id=" + id },
    document: { getElementById(key) {
      if (!elements.has(key)) elements.set(key, {});
      return elements.get(key);
    } },
    resolveSignedInAthlete: requestedId => resolveAuthenticatedAthlete({
      user: { uid: id }, requestedId,
      getAthleteById: async key => {
        reads.push(key);
        assert.equal(key, id);
        return athlete;
      },
      findAthletesByAuthUid: async () => assert.fail("Unexpected fallback query"),
    }),
    loadAthleteDashboard: async ({ athleteId }) => {
      assert.equal(athleteId, id);
      return { ready: true };
    },
    renderAthleteDashboard(target, model, athleteId) {
      assert.equal(target, grid);
      assert.equal(model.ready, true);
      assert.equal(athleteId, id);
      target.hidden = false;
    },
    normalizeDisciplineId: value => value,
    resolveAthleteDisciplineContext: () => ({ progression: {} }),
    LADDER_F8: [{}],
  });
  assert.deepEqual(reads, [id]);
  assert.equal(grid.hidden, false);
  assert.equal(elements.get("arsenalLink").href, "/athletes/arsenal/?id=" + id);
});

test("dashboard initialization dependencies and active curriculum assets are complete", () => {
  const loader = fs.readFileSync("public/assets/js/athlete-dashboard-data.js", "utf8");
  assert.match(loader, /getDoc\(doc\(db, "laneSubmissions", athleteId\)\)/);
  assert.match(loader, /getDoc\(doc\(db, "strengthPhaseSettings", "system"\)\)/);
  assert.match(loader, /collection\(db, "laneHistory"\)/);
  for (const path of [
    "public/vault/system-status.json",
    "public/vault/strength/segment1/segment1.meta.json",
    "public/vault/strength/segment1/sessions.json",
    "public/vault/honor/segment1/segment.meta.json",
    "public/vault/honor/segment1/sessions.json",
  ]) {
    assert.doesNotThrow(() => JSON.parse(fs.readFileSync(path, "utf8")), path);
  }
});
