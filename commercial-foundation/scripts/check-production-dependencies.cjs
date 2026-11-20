const fs = require("node:fs"); const path = require("node:path");
const root = path.resolve(__dirname, "..");
const prohibited = [/sandmandashboard/i, /sandman-combat-staging/i, /STRIPE_SECRET/i, /FIREBASE_CONFIG/i, /\.web\.app/i, /run\.app/i, /firebase-admin/i, /firebase-functions/i];
const files = [];
function walk(dir) { for (const entry of fs.readdirSync(dir, { withFileTypes: true })) { if (["lib", "node_modules"].includes(entry.name)) continue; const p = path.join(dir, entry.name); entry.isDirectory() ? walk(p) : files.push(p); } }
walk(path.join(root, "src")); walk(path.join(root, "test"));
const findings = files.flatMap(file => prohibited.filter(pattern => pattern.test(fs.readFileSync(file, "utf8"))).map(pattern => `${path.relative(root, file)}: ${pattern}`));
if (findings.length) { console.error(findings.join("\n")); process.exit(1); }
console.log(`PASS: ${files.length} Commercial source/test files contain no prohibited production dependency markers.`);
