// Sandman Silver — Controller/UI (Nov 13)
// Top-to-bottom controller with live Approve wiring.
// This file wires DOM → SilverCore (no Firebase imports here).

import { paintXp } from "./silver.xp.js";
import SilverCore, { setLive } from "./silver.core.js";

// Start safe. Flip to true after starting emulators.
setLive(false);
// named exports (so you can import { setLive } etc.)
export {
  setLive,
  getLive,
  mintUid,
  saveIntake,
  loadIntake,
  listIntakes,
  approveIntake,
  readAthlete,
  rankFrom,
  capFrom,
};
// -----------------------------------------------
// Boot
// -----------------------------------------------
export function initCore(){
  // ===== Invite token (demo-safe) =====
  const makeTokenBtn = document.getElementById("btn-make-token");
  const copyBtn      = document.getElementById("btn-copy-token");
  const linkEl       = document.getElementById("invite-link");
  const inviteStatus = document.getElementById("invite-status");

  makeTokenBtn?.addEventListener("click", ()=>{
    const token = "tok_"+Math.random().toString(36).slice(2,10);
    const url   = `${location.origin}${location.pathname}?invite=${token}`; // keeps /silver/index.html
    if (linkEl) linkEl.value = url;
    if (inviteStatus) inviteStatus.textContent = "Token created (48h).";
    // optional: reflect token in a view field
    const tv = document.getElementById("token-view");
    if (tv) tv.textContent = token;
  });

  copyBtn?.addEventListener("click", async ()=>{
    if (!linkEl?.value) return;
    await navigator.clipboard.writeText(linkEl.value);
    if (inviteStatus) inviteStatus.textContent = "Link copied.";
  });

  // ===== Mint preview buttons (track/tier/rank preview only) =====
  const mintF8 = document.getElementById("mint-f8");
  const mintF4 = document.getElementById("mint-f4");
  const outUid = document.getElementById("minted-uid");
  const hiddenTrack = document.getElementById("final-track");
  const hiddenTier  = document.getElementById("final-tier");
  const hiddenRank  = document.getElementById("final-rank");
  const hiddenUid   = document.getElementById("final-uid");

  function setMint(track, tier, rank){
    const uid = (track==="foundry8"?"F8":"F4")+"-"+Math.random().toString(36).slice(2,7).toUpperCase();
    outUid && (outUid.value = uid);
    hiddenUid && (hiddenUid.value = uid);
    hiddenTrack && (hiddenTrack.value = track);
    hiddenTier && (hiddenTier.value = tier);
    hiddenRank && (hiddenRank.value = rank);
    document.getElementById("out-uid")?.replaceChildren(uid);
    document.getElementById("out-track")?.replaceChildren(track.toUpperCase());
    document.getElementById("out-tier")?.replaceChildren(`${tier} / ${rank}`);
  }

  mintF8?.addEventListener("click", ()=> setMint("foundry8","T0","shadow"));
  mintF4?.addEventListener("click", ()=> setMint("foundry4","T0","apprentice"));

  // ===== Approve (LIVE wiring to SilverCore) =====
  const approveBtn = document.getElementById("btn-approve");
  const approveStatus = document.getElementById("approve-status");
  const coachLast = {
    public:  document.getElementById("coach-last-public"),
    uid:     document.getElementById("coach-last-uid"),
    track:   document.getElementById("coach-last-track"),
    tr:      document.getElementById("coach-last-tierrank"),
    team:    document.getElementById("coach-last-team"),
    cs:      document.getElementById("coach-last-citystate"),
    lock:    document.getElementById("coach-last-padlock"),
    panel:   document.getElementById("coach-last-approved"),
  };

  approveBtn?.addEventListener("click", async ()=>{
    const hiddenTrack = document.getElementById("final-track");
    const hiddenTier  = document.getElementById("final-tier");
    const hiddenRank  = document.getElementById("final-rank");

    const token = new URLSearchParams(location.search).get("invite") || 
                  document.getElementById("token-view")?.textContent || "";
    const trackBase = hiddenTrack?.value || "foundry8";
    const team = (document.getElementById("team-name")?.value || "TN").trim();
    const publicInitial = (document.getElementById("pub-initial")?.value || "").trim();
    const publicLast    = (document.getElementById("pub-last")?.value || "").trim();
    const city  = (document.getElementById("team-city")?.value || "").trim();
    const state = (document.getElementById("team-state")?.value || "").trim();

    approveStatus && (approveStatus.textContent = "Approving…");

    try {
      const res = await SilverCore.approveIntake({
        token, trackBase, team, publicInitial, publicLast, city, state
      });

      // Cache UID for Athlete panel and repaint
      localStorage.setItem("lastApprovedUid", res.uid);
      coachLast.public && (coachLast.public.textContent = `${publicInitial} ${publicLast}`.trim() || "—");
      coachLast.uid && (coachLast.uid.textContent = res.uid);
      coachLast.track && (coachLast.track.textContent = res.trackBase.toUpperCase());
      coachLast.tr && (coachLast.tr.textContent = `T0 / ${res.rankKey}`);
      coachLast.team && (coachLast.team.textContent = team);
      coachLast.cs && (coachLast.cs.textContent = `${city}, ${state}`);
      coachLast.lock && (coachLast.lock.textContent = "On");
      coachLast.panel && (coachLast.panel.style.display = "block");

      approveStatus && (approveStatus.textContent = "Approved.");
      window.paintWhenReady?.(res.uid);
    } catch (err) {
      console.error(err);
      approveStatus && (approveStatus.textContent = String(err.message || err));
    }
  });

  // ===== Athlete painter hook (uses demo data until FS read wired) =====
  window.paintWhenReady = function(uid){
    const hiddenTrack = document.getElementById("final-track");
    const hiddenTier  = document.getElementById("final-tier");
    const hiddenRank  = document.getElementById("final-rank");

    document.getElementById("ath-name")?.replaceChildren("—");
    const pi = (document.getElementById("pub-initial")?.value || "").trim();
    const pl = (document.getElementById("pub-last")?.value || "").trim();
    document.getElementById("ath-name-public")?.replaceChildren(`${pi} ${pl}`.trim() || "—");
    document.getElementById("ath-uid")?.replaceChildren(uid);

    const track = (hiddenTrack?.value || "foundry8").toUpperCase();
    const tier  = hiddenTier?.value || "T0";
    const rank  = hiddenRank?.value || (track==="FOUNDRY8"?"shadow":"apprentice");
    document.getElementById("ath-track")?.replaceChildren(track);
    document.getElementById("ath-tierrank")?.replaceChildren(`${tier} / ${rank}`);
    document.getElementById("ath-team")?.replaceChildren(document.getElementById("team-name")?.value || "—");
    document.getElementById("ath-citystate")?.replaceChildren(`${document.getElementById("team-city")?.value||"—"}, ${document.getElementById("team-state")?.value||"—"}`);
    document.getElementById("ath-status")?.replaceChildren("Active");

    // Demo XP paint (0/800, 0 stripes)
    paintXp({ xp: 0, cap: 800, tierColor: getComputedStyle(document.documentElement).getPropertyValue("--belt-color") || "#0ea5e9", stripes: 0 });
  };

  // ===== Find submitted / approved list (placeholders until FS list wired) =====
  document.getElementById("btn-find-intakes")?.addEventListener("click", ()=>{
    document.getElementById("pending-list")?.replaceChildren("Demo: 0 pending (wire FS).");
    document.getElementById("pending-count")?.replaceChildren("0");
  });
  document.getElementById("btn-open-athlete")?.addEventListener("click", ()=>{
    document.querySelector('.tab[data-tab="athlete"]')?.click();
  });
  document.getElementById("btn-toggle-approved")?.addEventListener("click", ()=>{
    const list = document.getElementById("approved-list");
    if (list) list.textContent = "Demo: (wire Firestore query for recent approvals)";
  });

  // ===== XP test buttons (local UI demo only) =====
  const xpMsg = document.getElementById("xp-msg");
  document.getElementById("btn-xp-10")?.addEventListener("click", ()=> bump(10));
  document.getElementById("btn-xp-5")?.addEventListener("click", ()=> bump(5));

  function bump(delta){
    const cur = Number(document.getElementById("ath-xp-val")?.textContent || 0);
    const cap = Number(document.getElementById("ath-xp-cap")?.textContent || 800);
    const next = Math.min(cap, cur + delta);
    const stripes = Math.min(4, Math.floor((next / cap) * 4));
    paintXp({ xp: next, cap, tierColor: getComputedStyle(document.documentElement).getPropertyValue("--belt-color") || "#0ea5e9", stripes });
    xpMsg && (xpMsg.textContent = `+${delta} (demo)`);
    setTimeout(()=> xpMsg && (xpMsg.textContent=""), 750);
  }
}

// Auto-boot
if (document.readyState === "loading"){
  document.addEventListener("DOMContentLoaded", initCore);
} else {
  initCore();
}
