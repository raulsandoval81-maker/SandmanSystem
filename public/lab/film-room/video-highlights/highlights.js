console.log("Team Highlights loaded");

// Mocked sample data (replace with Firestore later)
const sampleFeatured = {
  title: "State Qualifier Highlight",
  file: "state_recap.mp4",
  desc: "Big wins. Big moments. Sandman rising."
};

const sampleTeamReels = [
  { title: "Season Hype 2025", file: "hype2025.mp4", desc: "The Sandman Era begins." },
  { title: "Lompoc Dual Recap", file: "dual_lompoc.mp4", desc: "Energy. Pace. Momentum." },
];

const sampleSpotlights = [
  { title: "Max Sandoval — Aggressor Reel", file: "max_aggressor.mp4", desc: "Pace + Pressure." },
  { title: "Curran — Technique Reel", file: "curran_tech.mp4", desc: "Precision on the mat." },
];

// ========== FEATURED ==========

const featuredBox = document.getElementById("featured");
if (sampleFeatured){
  featuredBox.innerHTML = `
    <div class="tile" onclick="openVideo('${sampleFeatured.file}')">
      <div class="thumb"></div>
      <div class="tile-title">${sampleFeatured.title}</div>
      <div class="tile-sub">${sampleFeatured.desc}</div>
    </div>
  `;
}

// ========== TEAM REELS ==========

const teamGrid = document.getElementById("teamGrid");
teamGrid.innerHTML = sampleTeamReels.map(item=>`
  <div class="tile" onclick="openVideo('${item.file}')">
    <div class="thumb"></div>
    <div class="tile-title">${item.title}</div>
    <div class="tile-sub">${item.desc}</div>
  </div>
`).join("");

// ========== SPOTLIGHTS ==========

const spotlightGrid = document.getElementById("spotlightGrid");
spotlightGrid.innerHTML = sampleSpotlights.map(item=>`
  <div class="tile" onclick="openVideo('${item.file}')">
    <div class="thumb"></div>
    <div class="tile-title">${item.title}</div>
    <div class="tile-sub">${item.desc}</div>
  </div>
`).join("");

// ========== OPEN VIDEO ==========
window.openVideo = function(file){
  const url = `/athletes/recon/index.html?file=${encodeURIComponent(file)}`;
  window.location.href = url;
};
