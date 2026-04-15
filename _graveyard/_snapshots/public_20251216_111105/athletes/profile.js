// ============================
// Athlete Profile JS
// ============================

import {
  db, doc, getDoc,
  collection, query, where, orderBy, limit, getDocs
} from "/assets/js/firebase-init.js";

import { renderBeltBar } from "/assets/js/ui-belt.js";

const $ = (id)=>document.getElementById(id);

// Get athlete ID from URL
const params = new URLSearchParams(location.search);
const id = params.get("id");
const mode = params.get("mode") || "coach";

if (!id) {
  document.body.innerHTML = "<main class='wrap'><p>Missing ?id=…</p></main>";
  throw new Error("no id");
}

// collapsibles
document.querySelectorAll(".drop-head").forEach(btn=>{
  btn.addEventListener("click",()=>{
    const body = btn.parentElement.querySelector(".drop-body");
    if (body) body.classList.toggle("collapsed");
  });
});

(async ()=>{
  // load athlete
  const ref  = doc(db, "athletes", id);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    document.body.innerHTML = "<main class='wrap'><p>Unknown athlete.</p></main>";
    return;
  }
  const a = snap.data();

  // -------------------
  // Identity
  // -------------------
  $("ath-title").textContent  = a.fullName || a.publicName || id;
  $("out-name").textContent   = a.fullName || "—";
  $("out-public").textContent = a.publicName || "—";

  // avatar
  const avatar = $("ath-avatar");
  if (a.photoUrl) {
    avatar.style.backgroundImage = `url(${a.photoUrl})`;
  } else {
    avatar.textContent = (a.fullName || "?").slice(0,1);
  }

  // -------------------
  // Team logic
  // -------------------
  const rawTeam = a.team || "";
  const city = a.city || "Lompoc";

  const team = (() => {
    const n = rawTeam.toLowerCase();
    if (n === "lompoc strong" || n === "lompoc wrestling" || n === "lompoc")
      return "Lompoc Academy of Wrestling";
    if (n.startsWith("sandman"))
      return rawTeam;
    return `Sandman Combat\n${city} Academy of Wrestling`;
  })();

  $("out-team").innerHTML = team.split("\n")
    .map(line=>`<div style="font-size:.85em;color:#fff">${line}</div>`)
    .join("");

  $("out-citystate").textContent = [a.city, a.state].filter(Boolean).join(", ") || "—";

  // mint tag / UID
  $("out-uid").innerHTML =
    `<div>${a.mintVirtueTagDisplay || a.mintVirtueTag || a.uid || id}</div>`;

  // rank dot
  const rankName  = a.rankName  || a.tierName || "Apprentice";
  const rankColor = a.rankColor || "#ffffff";

  $("out-rank").innerHTML = `
    <span style="display:inline-block;width:10px;height:10px;border-radius:999px;background:${rankColor};margin-right:6px"></span>
    ${rankName}
  `;

  // -------------------
  // Combat belt
  // -------------------
  const track = a.trackCode || a.track || "";
  const tier  = a.tier || a.rank || "T0";
  const xp    = a.xp ?? 0;

  renderBeltBar({
    container: document.getElementById("ath-belt"),
    xp,
    trackCode: track,
    tier
  });

  // additional styling on belt
  const beltRoot = document.querySelector("#ath-belt .belt-bar");
  if (beltRoot) {
    const fill = beltRoot.querySelector(".belt-fill");
    const stripes = beltRoot.querySelectorAll(".stripe-box");
    const color = fill?.style.background || "#ffffff";

    beltRoot.style.background = color + "33";
    fill.style.filter = "brightness(1)";

    stripes.forEach(box=>{
      box.style.background = "transparent";
      box.style.border = "1px solid rgba(0,0,0,0.15)";
    });

    const isWhite = color.toLowerCase()==="#ffffff" || color==="white";
    stripes.forEach(box=>{
      box.classList.add(isWhite ? "white" : "black");
    });
  }

  $("ath-belt-meta").textContent =
    `${xp} / 1200 · Stripes ${Math.floor(Math.min(1200, xp)/300)}/4`;

  // -------------------
  // Honor / Strength
  // -------------------
  const honorXP    = a.xpHonor    ?? 0;
  const strengthXP = a.xpStrength ?? 0;

  $("honor-bar").style.width    = Math.min(100, Math.round(honorXP/24)) + "%";
  $("strength-bar").style.width = Math.min(100, Math.round(strengthXP/24)) + "%";

  $("xp-honor").textContent    = honorXP;
  $("xp-strength").textContent = strengthXP;
  $("honor-feather").textContent  = Math.floor(honorXP/300)+"/8";
  $("strength-ring").textContent   = Math.floor(strengthXP/400)+"/6";

  // -------------------
  // Skills
  // -------------------
  $("skill-neutral").textContent  = a.skillNeutral || "—";
  $("skill-top").textContent      = a.skillTop || "—";
  $("skill-bottom").textContent   = a.skillBottom || "—";
  $("matches-total").textContent  = a.matchesTotal ?? 0;
  $("record-wl").textContent      = `${a.wins ?? 0}-${a.losses ?? 0}`;
  $("coach-notes").textContent    = a.coachNotes || "—";

  // -------------------
  // XP Logs
  // -------------------
  try {
    const q = query(
      collection(db, "xpLogs"),
      where("athleteUid", "==", id),
      orderBy("ts", "desc"),
      limit(15)
    );
    const logs = await getDocs(q);
    const items = [];
    let lastStyle = null;

    logs.forEach(l=>{
      const d = l.data();
      const sign = d.delta > 0 ? "+" : "";
      items.push(
        `<li>${sign}${d.delta} <span class="muted">(${d.event || d.kind})</span></li>`
      );
      if (!lastStyle && (d.event?.includes("STYLE") || d.meta?.style)) {
        lastStyle = d.meta?.style;
      }
    });

    $("feed").innerHTML = items.length
      ? items.join("")
      : "<li class='muted'>No entries yet.</li>";

    $("last-style").textContent = lastStyle || "—";

  } catch (err) {
    $("feed").innerHTML = "<li class='muted'>Logs unavailable.</li>";
  }

  // -------------------
  // View modes
  // -------------------
  if (mode === "light") {
    document.querySelector('[data-block="strength"] .drop-body')?.classList.add("collapsed");
    document.querySelector('[data-block="honor"] .drop-body')?.classList.add("collapsed");
  }

  if (mode === "full") {
    document.querySelectorAll(".drop-body").forEach(d=>d.classList.remove("collapsed"));
  }

})();
