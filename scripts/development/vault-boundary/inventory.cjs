const { readdirSync, readFileSync } = require("node:fs");
const { join } = require("node:path");

const vault = join(__dirname, "../../../public/vault");
const paths = readdirSync(vault, { recursive: true })
  .filter(path => path.includes("/") && path.endsWith(".json") && !path.endsWith("/index.json"))
  .sort();

const athleteCandidates = new Set([
  "n", "id", "title", "lesson", "focus", "focusArea", "objective", "competency",
  "successStandard", "level", "format", "interval", "rounds", "movesPerCycle",
  "sequence", "virtue", "coachMessage", "coachReminder", "closingMessage",
  "principle", "houseStandard", "prompt", "questions", "deliverable", "scripture",
  "quote", "quoteAuthor", "athleteNote", "workout", "preset", "track",
]);
const internal = new Set([
  "releaseMode", "progressionMode", "updatedAt", "status", "sessionCount",
  "sessionRange", "lessonStart", "lessonEnd", "activeSessionId", "rotationMode",
]);

function classify(path, fields) {
  const key = fields.at(-1);
  if (fields.includes("coachNote")) return "Ambiguous · existing athlete display";
  if (fields.some(field => internal.has(field))) return "Internal release / catalog metadata";
  if (fields.includes("sessions") && fields.some(field => athleteCandidates.has(field))) {
    return "Athlete-deliverable candidate · eligibility and source approval required";
  }
  if (path.includes("/iron/") || path.includes("/segment-1/")) {
    return "Ambiguous · reference or delivery dependency";
  }
  return "Ambiguous · owner review required";
}

function inventory() {
  return paths.map(path => {
    const text = readFileSync(join(vault, path), "utf8");
    const fields = new Map();
    const value = text.trim() ? JSON.parse(text) : null;
    function visit(node, parts) {
      if (Array.isArray(node)) {
        for (const item of node) visit(item, parts);
      } else if (node && typeof node === "object") {
        for (const [name, child] of Object.entries(node)) {
          const next = [...parts, name];
          fields.set(next.join("."), classify(path, next));
          visit(child, next);
        }
      }
    }
    visit(value, []);
    return { path, fields: [...fields], sessions: value?.sessions?.length ?? 0, empty: value === null };
  });
}

if (require.main === module) {
  console.log("Source file\tField path\tProvisional access classification");
  for (const entry of inventory()) {
    if (entry.empty) console.log(`${entry.path}\t—\tEmpty source`);
    for (const [field, classification] of entry.fields) console.log(`${entry.path}\t${field}\t${classification}`);
  }
}
module.exports = { vault, paths, inventory };
