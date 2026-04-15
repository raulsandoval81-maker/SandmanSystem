// /public/assets/js/migrate-xp.js
// Run once, then delete this file + script tag.

import {
  db,
  collection,
  getDocs,
  addDoc,
  serverTimestamp,
} from "/assets/js/firebase-init.js";

const SOURCES = ["xp_log", "xpLogs"];   // move FROM these…
const TARGET  = "xp_logs";              // …INTO this (the new standard)

// Optional: quick duplicate guard (same athlete+points+timestamp to minute)
function makeKey(d) {
  const t = d.createdAt?.toDate ? d.createdAt.toDate() : null;
  const stamp = t
    ? `${t.getFullYear()}-${t.getMonth()+1}-${t.getDate()} ${t.getHours()}:${t.getMinutes()}`
    : "no-time";
  return `${(d.athlete ?? d.athleteLower ?? d.name ?? "").toLowerCase()}|${d.points ?? d.xp ?? 0}|${stamp}`;
}

async function migrateXP() {
  console.log("[migrate] starting…");
  const seen = new Set();
  let moved = 0, skipped = 0;

  for (const src of SOURCES) {
    console.log(`[migrate] scanning ${src}…`);
    const snap = await getDocs(collection(db, src));

    for (const doc of snap.docs) {
      const d = doc.data();

      const data = {
        athlete: (d.athlete ?? d.athleteLower ?? d.name ?? "unknown").toString(),
        points:  Number(d.points ?? d.xp ?? 0),
        category: d.category ?? "Technique",
        createdAt: d.createdAt ?? serverTimestamp(),
        status:  d.status ?? "approved",
      };

      const key = makeKey(data);
      if (seen.has(key)) { skipped++; continue; }
      seen.add(key);

      await addDoc(collection(db, TARGET), data);
      moved++;
      if (moved % 50 === 0) console.log(`[migrate] moved ${moved} so far…`);
    }
  }

  console.log(`[migrate] done. moved=${moved}, skipped_dupes=${skipped}`);
}

migrateXP();
