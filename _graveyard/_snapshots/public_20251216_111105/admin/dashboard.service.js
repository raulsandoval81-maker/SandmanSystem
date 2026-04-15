// public/admin/dashboard.service.js
// Admin dashboard wiring + mock data renderer

document.addEventListener("DOMContentLoaded", () => {
  // ------ DOM refs
  const $ = (id) => document.getElementById(id);
  const programSelect = $("program");
  const rows = $("rows");
  const mTotal = $("mTotal");
  const mAthletes = $("mAthletes");
  const mAvg = $("mAvg");
  const scoped = $("scoped");

  // ------ URL -> initial filter
  const url = new URL(location.href);
  const initial = url.searchParams.get("program") || "all";
  if (programSelect) programSelect.value = initial;

  // ------ MOCK DATA (swap to Firestore later)
  const MOCK = [
    { ts: Date.now() - 1000 * 60 * 60 * 6,  athlete: "A. Lopez", program: "wrestling",             xp: 30, note: "Drill set A" },
    { ts: Date.now() - 1000 * 60 * 60 * 20, athlete: "B. Tran",  program: "boxing",                xp: 25, note: "Spar 3x2" },
    { ts: Date.now() - 1000 * 60 * 60 * 28, athlete: "C. Vang",  program: "muay_thai",             xp: 40, note: "Pads + clinch" },
    { ts: Date.now() - 1000 * 60 * 60 * 40, athlete: "D. King",  program: "submission_grappling",  xp: 35, note: "No-Gi" },
    { ts: Date.now() - 1000 * 60 * 60 * 50, athlete: "E. Snow",  program: "kick_boxing",           xp: 20, note: "Footwork" },
    { ts: Date.now() - 1000 * 60 * 60 * 68, athlete: "F. Wu",    program: "mma",                   xp: 45, note: "Wall work" },
  ];

  // ------ helpers
  const fmt = (ts) => {
    const d = new Date(ts);
    return d.toLocaleDateString() + " " + d.toLocaleTimeString();
  };

  const getData = (program) => {
    let data = MOCK.slice().sort((a, b) => b.ts - a.ts);
    if (program && program !== "all") data = data.filter((r) => r.program === program);
    return data;
  };

  const render = (program) => {
    const data = getData(program);

    // metrics
    mTotal.textContent = String(data.length);
    mAthletes.textContent = String(new Set(data.map((r) => r.athlete)).size);
    mAvg.textContent = data.length ? String(Math.round(data.reduce((s, r) => s + r.xp, 0) / data.length)) : "0";
    scoped.textContent = program || "all";

    // table rows
    rows.innerHTML = data.length
      ? data
          .map(
            (r) => `
        <tr>
          <td>${fmt(r.ts)}</td>
          <td>${r.athlete}</td>
          <td><span class="pill">${r.program}</span></td>
          <td>${r.xp}</td>
          <td>${r.note || ""}</td>
        </tr>`
          )
          .join("")
      : `<tr><td colspan="5" style="text-align:center;color:#666">No entries yet.</td></tr>`;

    // reflect URL param without reload
    const u = new URL(location.href);
    if (!program || program === "all") u.searchParams.delete("program");
    else u.searchParams.set("program", program);
    history.replaceState(null, "", u);
  };

  // ------ events
  if (programSelect) {
    programSelect.addEventListener("change", (e) => render(e.target.value));
  }

  // Lazy-load snapshot page when requested
  const snapshotBtn = document.querySelector("[data-snapshot]");
  if (snapshotBtn) {
    snapshotBtn.addEventListener("click", async () => {
      try {
        const mod = await import("./snapshot.page.js");
        // If snapshot.page.js exports an initializer, call it; otherwise it will self-run.
        if (typeof mod.initSnapshot === "function") mod.initSnapshot();
      } catch (err) {
        console.error("Failed to load snapshot module:", err);
        alert("Sorry—couldn't load Snapshot. Check console for details.");
      }
    });
  }

  // initial paint
  render(initial);
});
