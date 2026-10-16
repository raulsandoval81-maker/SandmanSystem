import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const rankNames = Object.freeze({ T0: "Apprentice", T1: "Warrior", T2: "Champion", T3: "Veteran", T4: "Legend" });
const expectedCounts = Object.freeze({ wrestling: [20, 20, 30, 30, 30], kickboxing: [20, 20, 25, 30, 30] });
const familyModule = await import(pathToFileURL(path.join(repoRoot, "public/coaches/cards/wrestling/family-map.js")));
const wrestlingFamilies = familyModule.WRESTLING_CARD_FAMILIES.p2l;

function cardTitle(source, cardPath) {
  const title = source.match(/<h2>Skill(?:\s+\d+)?\s+—\s+([^<]+)<\/h2>/)?.[1];
  if (!title) throw new Error(`Missing Coach Card title: ${cardPath}`);
  return title.replaceAll("&amp;", "&").trim();
}

function cardId(source, cardPath) {
  const id = source.match(/data-id="([^"]+)"/)?.[1];
  if (!id) throw new Error(`Missing Coach Card ID: ${cardPath}`);
  return id;
}

for (const discipline of Object.keys(expectedCounts)) {
  const placements = [];
  for (let tierIndex = 0; tierIndex <= 4; tierIndex += 1) {
    const tier = `T${tierIndex}`;
    const directory = path.join(repoRoot, `public/coaches/cards/teen/p2l-${discipline}/t${tierIndex}`);
    const files = (await readdir(directory)).filter((file) => /^skill-\d+-.*\.html$/.test(file)).sort();
    if (files.length !== expectedCounts[discipline][tierIndex]) {
      throw new Error(`${discipline} ${tier} expected ${expectedCounts[discipline][tierIndex]} cards, found ${files.length}`);
    }
    for (const file of files) {
      const absolutePath = path.join(directory, file);
      const source = await readFile(absolutePath, "utf8");
      const slug = file.replace(/^skill-\d+-/, "").replace(/\.html$/, "");
      placements.push({
        cardId: cardId(source, absolutePath), tier, rankName: rankNames[tier],
        skillTitle: cardTitle(source, absolutePath),
        familyId: discipline === "wrestling" ? wrestlingFamilies[`t${tierIndex}`]?.[slug] || "" : "",
      });
    }
  }
  if (new Set(placements.map(({ cardId: id }) => id)).size !== placements.length) throw new Error(`${discipline} Coach Card IDs are not unique`);
  if (discipline === "wrestling" && placements.some(({ familyId }) => !familyId)) throw new Error("Path2Legend Wrestling family projection is incomplete");
  const output = { version: `path2legend-${discipline}-skill-tree-v1`, journey: "P2L", discipline, rankNames, placements };
  const outputPath = path.join(repoRoot, `public/assets/data/path2legend-${discipline}-skill-tree.json`);
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`, "utf8");
  console.log(`Wrote ${placements.length} ${discipline} placements to ${outputPath}`);
}
