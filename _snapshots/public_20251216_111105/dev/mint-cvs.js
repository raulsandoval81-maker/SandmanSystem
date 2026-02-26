// dev/mint-csv.js — Mint CSV Generator v2.0
// Requires: /assets/js/virtues-data.js

import { ALL_MINTS } from "../assets/js/virtues-data.js";

function buildCsv(track, lane, list) {
  const header = "track,lane,num,virtue,cap,tag";
  const rows = list.map(v =>
    `${track},${lane},${v.num.toString().padStart(4, "0")},${v.virtue},${v.cap},${v.tag}`
  );
  return [header, ...rows].join("\n");
}

export function exportMintCsv(track, lane) {
  const set = ALL_MINTS[track]?.[lane];
  if (!set || set.length === 0) {
    alert(`No mint data for ${track}/${lane}`);
    return;
  }
  const csv = buildCsv(track, lane, set);
  navigator.clipboard.writeText(csv);
  return csv;
}

// Optional: Dump whole system
export function exportAllCsv() {
  const out = [];
  for (const track of ["F8", "F4"]) {
    for (const lane of ["CB", "LS", "SP"]) {
      const set = ALL_MINTS[track][lane];
      if (!set?.length) continue;
      out.push(buildCsv(track, lane, set));
    }
  }
  return out.join("\n\n");
}
