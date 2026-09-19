const admin = require("firebase-admin");

if (!admin.apps.length) {
  admin.initializeApp({
    projectId: "sandmandashboard",
  });
}

const db = admin.firestore();

const LEGACY_VALUES = new Set([
  "Lompoc Academy of Wrestling",
  "Solvang Academy",
  "LAW",
]);

function athleteName(data = {}) {
  return (
    data.fullName ||
    data.publicName ||
    data.name ||
    data.displayName ||
    "Unknown athlete"
  );
}

function collectCandidates(data = {}) {
  return [
    ["team", data.team],
    ["teamName", data.teamName],
    ["academy", data.academy],
    ["location.team", data.location?.team],
    ["team.name", data.team?.name],
  ];
}

async function main() {
  console.log("READ-ONLY LEGACY TEAM AUDIT");
  console.log("---------------------------");

  const snapshot = await db
    .collection("athletes")
    .get();

  const matches = [];

  for (const doc of snapshot.docs) {
    const data = doc.data();

    const matchedFields = collectCandidates(data)
      .filter(([, value]) =>
        typeof value === "string" &&
        LEGACY_VALUES.has(value.trim())
      )
      .map(([field, value]) => ({
        field,
        value: value.trim(),
      }));

    if (!matchedFields.length) continue;

    matches.push({
      athleteId: doc.id,
      name: athleteName(data),
      matchedFields,
      activeDiscipline:
        data.activeDiscipline ||
        data.primaryDiscipline ||
        data.discipline ||
        data.art ||
        null,
    });
  }

  if (!matches.length) {
    console.log("\nNo legacy team values found.");
  } else {
    console.log(`\nFound ${matches.length} athlete record(s):\n`);

    for (const match of matches) {
      console.log(
        `${match.athleteId} | ${match.name}` +
        (match.activeDiscipline
          ? ` | discipline=${match.activeDiscipline}`
          : "")
      );

      for (const item of match.matchedFields) {
        console.log(
          `  ${item.field} = ${item.value}`
        );
      }
    }
  }

  console.log("\n---------------------------");
  console.log(`Athletes scanned: ${snapshot.size}`);
  console.log(`Legacy records found: ${matches.length}`);
  console.log("READ ONLY — no Firestore writes performed.");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Audit failed:", err);
    process.exit(1);
  });
