console.log("Video Vault loaded (skeleton)");

// Placeholder dataset (later replaced by Firestore)
const sampleVault = [
  { name:"match_01.mp4", tag:"Match" },
  { name:"practice_12.mov", tag:"Practice" },
  { name:"state_prep_drill.mp4", tag:"Prestige" }
];

const grid = document.getElementById("vaultGrid");

// populate grid
function renderVault(items){
  grid.innerHTML = "";
  items.forEach(item=>{
    const card = document.createElement("div");
    card.className = "vault-card";
    card.innerHTML = `
      <div class="thumb"></div>
      <div class="meta">
        <span class="name">${item.name}</span>
        <span class="tag">${item.tag}</span>
      </div>
    `;
    card.onclick = () => {
      // future pathways:
      // /athletes/recon/?file=...
      // /athletes/video-console/?file=...
      console.log("open", item.name);
    };
    grid.appendChild(card);
  });
}

renderVault(sampleVault);
