import {
  db,
  collection,
  query,
  orderBy,
  onSnapshot,
  doc,
  getDoc
} from "/assets/js/firebase-init.js";

const trackEl    = document.getElementById("track");
const monthEl    = document.getElementById("month");
const periodEl   = document.getElementById("periodMode");
const searchEl   = document.getElementById("search");
const nameModeEl = document.getElementById("nameMode");
const tagModeEl  = document.getElementById("tagMode");
const totalsBody = document.getElementById("totalsBody");
const rowsBody   = document.getElementById("rowsBody");
const statusEl   = document.getElementById("status");
const sortXpBtn  = document.getElementById("sortXp");
const sortDtBtn  = document.getElementById("sortDate");
const typeRow    = document.getElementById("typeRow");

const statEntriesEl  = document.getElementById("statEntries");
const statAthletesEl = document.getElementById("statAthletes");
const statTopEl      = document.getElementById("statTop");
const statAvgXpEl    = document.getElementById("statAvgXp");
const statLatestEl   = document.getElementById("statLatest");

const activeAthleteFilter = document.getElementById("activeAthleteFilter");
const activeAthleteFilterLabel = document.getElementById("activeAthleteFilterLabel");
const clearAthleteFilterBtn = document.getElementById("clearAthleteFilter");

let unsub = null;
let cache = [];
let sortKey = "xp";
let sortDir = "desc";
let selectedAthleteUid = "";
const nameCache = new Map();
const tagCache  = new Map();

const monthKey = (d = new Date()) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
};

if (monthEl && !monthEl.value) monthEl.value = monthKey();

function selectedPeriod() {
  return periodEl?.value || "month";
}

function selectedType() {
  const active = typeRow?.querySelector(".chip.active");
  return active ? active.dataset.type : "all";
}

function labelForRow(r) {
  const k = (r.kind || r.type || "").toLowerCase();
  if (k === "attendance" || k.startsWith("practice")) return "Daily Grind";
  if (k.startsWith("tournament")) return "Tournament";
  if (k.startsWith("style")) return "Style";
  if (Number(r.xp) < 0) return "Penalty";
  return r.kind || r.type || "—";
}

function rowClassForType(r) {
  const k = (r.kind || r.type || "").toLowerCase();
  if (Number(r.xp) < 0) return "row-penalty";
  if (k.startsWith("style")) return "row-style";
  if (k.startsWith("tournament")) return "row-tournament";
  return "";
}

const toVirtur = v => v ? String(v).padStart(7, "0") : "";

function abbreviate(full = "") {
  if (!full) return "";
  const parts = full.trim().split(/\s+/);
  const last  = parts.pop() || "";
  const first = parts.shift() || "";
  return first ? `${first[0].toUpperCase()}. ${last}` : last;
}

function displayNameFromParts(uid, full) {
  const mode = nameModeEl?.value || "full";
  let nameOut = full || "";

  if (mode === "abbr" && full) nameOut = abbreviate(full);
  if (!nameOut) nameOut = uid || "—";

  return nameOut;
}

function displayName(r) {
  const uid = r.uid;
  const full = r.athleteName || nameCache.get(uid) || "";
  const nameOut = displayNameFromParts(uid, full);

  if ((tagModeEl?.value || "off") === "on") {
    const tag = r.virturTag ?? r.dogTag ?? tagCache.get(uid);
    const t = toVirtur(tag);
    if (t) return `<span class="virtur">${t}</span>${nameOut}`;
  }

  return nameOut;
}

function filteredRows() {
  let rows = [...cache];
  const q = (searchEl?.value || "").trim().toLowerCase();

  if (q) {
    rows = rows.filter(r => {
      const full = (r.athleteName || nameCache.get(r.uid) || "").toLowerCase();
      const uid = (r.uid || "").toLowerCase();
      return full.includes(q) || uid.includes(q);
    });
  }

  const t = selectedType();
  if (t !== "all") {
    rows = rows.filter(r => {
      const k = (r.kind || r.type || "").toLowerCase();
      if (t === "practice") return k === "attendance" || k.startsWith("practice");
      if (t === "tournament") return k.startsWith("tournament");
      if (t === "style") return k.startsWith("style");
      if (t === "penalty") return Number(r.xp) < 0;
      return true;
    });
  }

  if (selectedAthleteUid) {
    rows = rows.filter(r => r.uid === selectedAthleteUid);
  }

  return rows;
}

function totalsByUid(rows) {
  const map = new Map();

  for (const r of rows) {
    const uid = r.uid || r.athleteName || r.id;
    const prev = map.get(uid) || {
      uid,
      name: r.athleteName || nameCache.get(uid) || "",
      virturTag: r.virturTag ?? r.dogTag ?? tagCache.get(uid),
      total: 0
    };

    prev.total += Number(r.xp || 0);
    map.set(uid, prev);
  }

  return [...map.values()].sort((a, b) => b.total - a.total);
}

async function backfill(rows) {
  const need = new Set();

  rows.forEach(r => {
    const uid = r.uid;
    if (!uid) return;
    if (!nameCache.has(uid) || !tagCache.has(uid)) need.add(uid);
  });

  for (const uid of need) {
    try {
      const snap = await getDoc(doc(db, "athletes", uid));
      if (snap.exists()) {
        const d = snap.data();
        if (d.fullName) nameCache.set(uid, d.fullName);
        if (d.virturTag != null) tagCache.set(uid, d.virturTag);
        else if (d.dogTag != null) tagCache.set(uid, d.dogTag);
      }
    } catch (e) {}
  }
}

function syncSortButtons() {
  if (!sortXpBtn || !sortDtBtn) return;
  sortXpBtn.classList.toggle("secondary", sortKey !== "xp");
  sortDtBtn.classList.toggle("secondary", sortKey !== "date");
}

function syncActiveAthleteFilter() {
  if (!activeAthleteFilter || !activeAthleteFilterLabel) return;

  if (!selectedAthleteUid) {
    activeAthleteFilter.classList.remove("show");
    activeAthleteFilterLabel.textContent = "Showing all athletes";
    return;
  }

  const full = nameCache.get(selectedAthleteUid) || selectedAthleteUid;
  activeAthleteFilterLabel.textContent = `Showing only: ${full}`;
  activeAthleteFilter.classList.add("show");
}

function formatLatest(rows) {
  if (!rows.length) return "—";

  const sorted = [...rows].sort((a, b) => {
    const as = a.createdAt?.seconds || 0;
    const bs = b.createdAt?.seconds || 0;
    return bs - as;
  });

  const latest = sorted[0];
  if (!latest?.createdAt?.toDate) return "—";

  return latest.createdAt.toDate().toLocaleString();
}

function averageXp(totals) {
  if (!totals.length) return 0;
  const sum = totals.reduce((acc, t) => acc + Number(t.total || 0), 0);
  return Math.round(sum / totals.length);
}

function chipCount(type, rows) {
  if (type === "all") return rows.length;

  return rows.filter(r => {
    const k = (r.kind || r.type || "").toLowerCase();
    if (type === "practice") return k === "attendance" || k.startsWith("practice");
    if (type === "tournament") return k.startsWith("tournament");
    if (type === "style") return k.startsWith("style");
    if (type === "penalty") return Number(r.xp) < 0;
    return true;
  }).length;
}

function updateChipCounts() {
  if (!typeRow) return;

  const chips = [...typeRow.querySelectorAll(".chip")];
  chips.forEach(chip => {
    const type = chip.dataset.type;
    const base =
      type === "all" ? "All" :
      type === "practice" ? "Daily Grind" :
      type === "tournament" ? "Tournament" :
      type === "style" ? "Style" :
      type === "penalty" ? "Penalty" : type;

    chip.textContent = `${base} (${chipCount(type, cache)})`;
  });
}

function render() {
  const rows = filteredRows();
  const baseTotals = totalsByUid(cache);
  const totals = totalsByUid(rows);

  if (statEntriesEl) statEntriesEl.textContent = rows.length;
  if (statAthletesEl) statAthletesEl.textContent = totals.length;
  if (statTopEl) {
    statTopEl.textContent = baseTotals[0]
      ? displayNameFromParts(baseTotals[0].uid, baseTotals[0].name || baseTotals[0].uid)
      : "—";
  }
  if (statAvgXpEl) statAvgXpEl.textContent = averageXp(baseTotals);
  if (statLatestEl) statLatestEl.textContent = formatLatest(cache);

  if (totalsBody) {
    totalsBody.innerHTML = totals.slice(0, 20).map((t, i) => {
      const nm = displayNameFromParts(t.uid, t.name || t.uid);
      const virtur = (tagModeEl?.value === "on") ? toVirtur(t.virturTag) : "";
      const isActive = selectedAthleteUid === t.uid;

      return `
        <tr class="totals-row ${isActive ? "active" : ""}" data-uid="${t.uid}">
          <td><span class="rank-pill">#${i + 1}</span></td>
          <td>${virtur ? `<span class="virtur">${virtur}</span>` : ""}${nm}</td>
          <td><strong>${t.total}</strong></td>
        </tr>
      `;
    }).join("") || `<tr><td colspan="3" class="empty">No data.</td></tr>`;
  }

  rows.sort((a, b) => {
    if (sortKey === "xp") {
      return sortDir === "desc"
        ? Number(b.xp) - Number(a.xp)
        : Number(a.xp) - Number(b.xp);
    }

    const as = a.createdAt?.seconds || 0;
    const bs = b.createdAt?.seconds || 0;
    return sortDir === "desc" ? bs - as : as - bs;
  });

  if (rowsBody) {
    rowsBody.innerHTML = rows.map(r => `
      <tr class="${rowClassForType(r)}">
        <td>${displayName(r)}</td>
        <td>${labelForRow(r)}</td>
        <td>${Number(r.xp) || 0}</td>
        <td class="muted">${r.createdAt?.toDate ? r.createdAt.toDate().toLocaleString() : ""}</td>
      </tr>
    `).join("") || `<tr><td colspan="4" class="empty">No entries.</td></tr>`;
  }

  if (statusEl) {
    const period = selectedPeriod();
    statusEl.textContent = period === "lifetime"
      ? `Track: ${trackEl.value} · Lifetime · Loaded ${rows.length} entries.`
      : `Track: ${trackEl.value} · Month: ${monthEl.value || monthKey()} · Loaded ${rows.length} entries.`;
  }

  updateChipCounts();
  syncActiveAthleteFilter();
}

function listen() {
  const track = trackEl.value;
  const mk = monthEl?.value || monthKey();
  const period = selectedPeriod();

  if (unsub) {
    unsub();
    unsub = null;
  }

  selectedAthleteUid = "";
  syncActiveAthleteFilter();

  let entriesRef;

  if (period === "lifetime") {
    if (monthEl) monthEl.disabled = true;

    statusEl.textContent = `Listening to leaderboards/${track}/lifetime/entries…`;

    entriesRef = collection(
      db,
      "leaderboards",
      track,
      "lifetime",
      "entries"
    );
  } else {
    if (monthEl) monthEl.disabled = false;

    statusEl.textContent = `Listening to leaderboards/${track}/months/${mk}/entries…`;

    entriesRef = collection(
      db,
      "leaderboards",
      track,
      "months",
      mk,
      "entries"
    );
  }

  const qy = query(entriesRef, orderBy("createdAt", "desc"));

  unsub = onSnapshot(qy, async snap => {
    cache = snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .filter(r => {
        const uid = String(r.uid || r.athleteUid || r.id || "").toUpperCase();
        const name = String(r.athleteName || "").toLowerCase();

        return (
          !uid.includes("_TEST_") &&
          !uid.includes("_GHOST_") &&
          !uid.includes("GHOST") &&
          !name.includes("dev") &&
          !name.includes("ghost")
        );
      });

    await backfill(cache);
    render();
  }, err => {
    console.error(err);
    if (statusEl) statusEl.textContent = "Error loading leaderboard.";
  });
}

trackEl?.addEventListener("change", listen);
monthEl?.addEventListener("change", listen);
periodEl?.addEventListener("change", listen);
searchEl?.addEventListener("input", render);
nameModeEl?.addEventListener("change", render);
tagModeEl?.addEventListener("change", render);

if (typeRow) {
  typeRow.addEventListener("click", e => {
    const chip = e.target.closest(".chip");
    if (!chip) return;

    typeRow.querySelectorAll(".chip").forEach(c => c.classList.remove("active"));
    chip.classList.add("active");
    render();
  });
}

if (totalsBody) {
  totalsBody.addEventListener("click", e => {
    const row = e.target.closest(".totals-row");
    if (!row) return;

    const uid = row.dataset.uid || "";
    selectedAthleteUid = selectedAthleteUid === uid ? "" : uid;
    render();
  });
}

clearAthleteFilterBtn?.addEventListener("click", () => {
  selectedAthleteUid = "";
  render();
});

sortXpBtn?.addEventListener("click", () => {
  if (sortKey === "xp") {
    sortDir = sortDir === "desc" ? "asc" : "desc";
  } else {
    sortKey = "xp";
    sortDir = "desc";
  }

  syncSortButtons();
  render();
});

sortDtBtn?.addEventListener("click", () => {
  if (sortKey === "date") {
    sortDir = sortDir === "desc" ? "asc" : "desc";
  } else {
    sortKey = "date";
    sortDir = "desc";
  }

  syncSortButtons();
  render();
});

syncSortButtons();
listen();