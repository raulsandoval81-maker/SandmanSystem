const fs = require("fs");
const path = require("path");

const ROOTS = [
  ["public/coaches/cards/youth/z2h-wrestling", "z2h", "wrestling"],

  ["public/coaches/cards/teen/p2l-wrestling", "p2l", "wrestling"],
  ["public/coaches/cards/teen/p2l-boxing", "p2l", "boxing"],
  ["public/coaches/cards/teen/p2l-kickboxing", "p2l", "kickboxing"],

  ["public/coaches/cards/adult/q2m-mma", "q2m", "mma"],
  ["public/coaches/cards/adult/r2g-boxing", "r2g", "boxing"],
];

let changed = 0;
let checked = 0;

function walk(dir, journey, discipline) {
  if (!fs.existsSync(dir)) return;

  for (const item of fs.readdirSync(dir)) {
    const full = path.join(dir, item);
    const stat = fs.statSync(full);

    if (stat.isDirectory()) {
      walk(full, journey, discipline);
      continue;
    }

    if (!item.startsWith("skill-") || !item.endsWith(".html")) continue;

    checked++;

    const tierMatch = full.match(/\/(t\d+)\//);
    if (!tierMatch) return;

    const tier = tierMatch[1];

    let html = fs.readFileSync(full, "utf8");
    const original = html;

    html = html.replace(/<button([\s\S]*?data-add-card[\s\S]*?)>/g, (match) => {
      let updated = match;

      if (!/data-discipline=/.test(updated)) {
        updated = updated.replace(/data-category="[^"]*"/, `$&\n    data-discipline="${discipline}"`);
      }

      if (!/data-journey=/.test(updated)) {
        updated = updated.replace(/data-discipline="[^"]*"/, `$&\n    data-journey="${journey}"`);
      }

      if (!/data-tier=/.test(updated)) {
        updated = updated.replace(/data-journey="[^"]*"/, `$&\n    data-tier="${tier}"`);
      }

      return updated;
    });

    if (html !== original) {
      fs.writeFileSync(full, html, "utf8");
      changed++;
      console.log("UPDATED:", full);
    }
  }
}

for (const [dir, journey, discipline] of ROOTS) {
  walk(dir, journey, discipline);
}

console.log(`\nChecked ${checked} skill files.`);
console.log(`Updated ${changed} files.`);