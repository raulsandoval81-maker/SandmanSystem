import { applicationDefault, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import {
  buildF8MigrationReview,
  classifyF8Candidate,
} from "./f8-five-rank-migration-core.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDir, "../..");
const outputDirectory = path.join(repositoryRoot, "logs", "f8-five-rank-migration-dry-run");
const jsonPath = path.join(outputDirectory, "f8-five-rank-migration-dry-run.json");
const csvPath = path.join(outputDirectory, "f8-five-rank-migration-dry-run.csv");

function assertIgnoredOutput(targetPath) {
  try {
    execFileSync("git", ["check-ignore", "-q", targetPath], {
      cwd: repositoryRoot,
      stdio: "ignore",
    });
  } catch {
    throw new Error(`Refusing to write private report outside a git-ignored location: ${targetPath}`);
  }
}

function safeNumber(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

async function summarizeQuery(query) {
  const snapshot = await query.get();
  const byKind = {};
  let amountTotal = 0;
  for (const document of snapshot.docs) {
    const data = document.data() ?? {};
    const kind = String(data.kind ?? "UNKNOWN");
    byKind[kind] = (byKind[kind] ?? 0) + 1;
    amountTotal += safeNumber(data.amount ?? data.delta);
  }
  return { count: snapshot.size, amountTotal, byKind };
}

async function loadContext(db, athlete, documentId) {
  const uidCandidates = [...new Set([documentId, athlete.uid, athlete.uidCode, athlete.id].filter(Boolean).map(String))];
  const combined = {
    xpLogs: { count: 0, amountTotal: 0, byKind: {} },
    xp_logs: { count: 0, amountTotal: 0, byKind: {} },
  };
  const monthlyDocuments = [];

  for (const uid of uidCandidates) {
    for (const collectionName of ["xpLogs", "xp_logs"]) {
      const summary = await summarizeQuery(db.collection(collectionName).where("uid", "==", uid));
      const destination = combined[collectionName];
      destination.count += summary.count;
      destination.amountTotal += summary.amountTotal;
      for (const [kind, count] of Object.entries(summary.byKind)) {
        destination.byKind[kind] = (destination.byKind[kind] ?? 0) + count;
      }
    }
    const monthlySnapshot = await db.collection("xp_monthly").where("uid", "==", uid).get();
    for (const monthlyDoc of monthlySnapshot.docs) {
      const data = monthlyDoc.data() ?? {};
      monthlyDocuments.push({
        id: monthlyDoc.id,
        month: data.month ?? null,
        attendance: data.attendance ?? null,
        arena: data.arena ?? null,
        strength: data.strength ?? null,
        honor: data.honor ?? null,
      });
    }
  }
  return { logSummary: combined, xpMonthlySummary: monthlyDocuments };
}

function csvEscape(value) {
  const text = value === null || value === undefined ? "" : String(value);
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function toCsv(reviews) {
  const headers = [
    "documentId", "internalId", "displayName", "legacyTier", "legacyRank", "legacyXp",
    "legacyXpCap", "legacyStripeCount", "oldCumulativeJourneyXp", "proposedTier",
    "proposedRank", "proposedActiveXp", "proposedXpCap", "proposedStripeCount",
    "proposedStripeThresholds", "proposedRankPercent", "warningCodes", "manualReview",
  ];
  const rows = reviews.map((review) => {
    const warnings = review.warnings.map((item) => item.code);
    return [
      review.identity.documentId,
      review.identity.internalId,
      review.identity.displayName,
      review.legacyProgression.tier,
      review.legacyProgression.rankName,
      review.legacyProgression.xp,
      review.legacyProgression.xpCap,
      review.legacyProgression.stripeCount,
      review.proposal?.oldCumulativeJourneyXp,
      review.proposal?.proposedTier,
      review.proposal?.proposedRank,
      review.proposal?.proposedActiveXp,
      review.proposal?.proposedXpCap,
      review.proposal?.proposedStripeCount,
      review.proposal?.proposedStripeThresholds?.join("|"),
      review.proposal?.proposedRankPercent,
      warnings.join("|"),
      warnings.length > 0 ? "YES" : "NO",
    ];
  });
  return [headers, ...rows].map((row) => row.map(csvEscape).join(",")).join("\n") + "\n";
}

async function main() {
  assertIgnoredOutput(jsonPath);
  assertIgnoredOutput(csvPath);
  if (!getApps().length) initializeApp({ credential: applicationDefault() });
  const db = getFirestore();
  const athleteSnapshot = await db.collection("athletes").get();
  const reviews = [];
  const excludedAmbiguous = [];

  for (const document of athleteSnapshot.docs) {
    const athlete = document.data() ?? {};
    const classification = classifyF8Candidate(document.id, athlete);
    if (!classification.accepted) {
      if (classification.ambiguous) {
        excludedAmbiguous.push({
          documentId: document.id,
          internalId: athlete.uid ?? athlete.uidCode ?? athlete.id ?? null,
          reason: classification.reason,
          evidence: classification.evidence,
        });
      }
      continue;
    }
    const context = await loadContext(db, athlete, document.id);
    const result = buildF8MigrationReview(document.id, athlete, context);
    if (result.included) reviews.push(result.review);
  }

  reviews.sort((a, b) => a.identity.documentId.localeCompare(b.identity.documentId));
  excludedAmbiguous.sort((a, b) => a.documentId.localeCompare(b.documentId));
  const manualReviewCount = reviews.filter((review) => review.warnings.length > 0).length;
  const report = {
    reportVersion: "f8-five-rank-migration-dry-run-v1",
    generatedAt: new Date().toISOString(),
    readOnly: true,
    summary: {
      athleteDocumentsRead: athleteSnapshot.size,
      f8Candidates: reviews.length,
      mappedCleanly: reviews.length - manualReviewCount,
      manualReview: manualReviewCount,
      ambiguousExcluded: excludedAmbiguous.length,
    },
    reviews,
    excludedAmbiguous,
  };

  await mkdir(outputDirectory, { recursive: true });
  await writeFile(jsonPath, JSON.stringify(report, null, 2) + "\n", { mode: 0o600 });
  await writeFile(csvPath, toCsv(reviews), { mode: 0o600 });
  console.log(JSON.stringify({ ...report.summary, jsonPath, csvPath }, null, 2));
}

main().catch((error) => {
  console.error("F8 migration dry run failed:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
