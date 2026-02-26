console.log("Video Console loaded");

// ===== VIDEO LOADING FROM URL PARAM =====
const urlParams = new URLSearchParams(window.location.search);
const file = urlParams.get("file");

const player = document.getElementById("player");
if (file){
  player.src = `/media/${file}`;  // change to real path later
}

// ===== SPEED CONTROLS =====
document.getElementById("btn-slow").onclick = () => player.playbackRate = 0.25;
document.getElementById("btn-normal").onclick = () => player.playbackRate = 1;
document.getElementById("btn-fast").onclick = () => player.playbackRate = 2;

// ===== SCRUB CONTROLS =====
document.getElementById("btn-prev").onclick = () => player.currentTime -= 2;
document.getElementById("btn-next").onclick = () => player.currentTime += 2;

// ===== FLAGS =====
const flagList = document.getElementById("flagList");
let flags = [];

document.getElementById("btn-flag").onclick = () => {
  const t = Math.floor(player.currentTime);
  flags.push(t);
  renderFlags();
};

function renderFlags(){
  flagList.innerHTML = "";
  flags.forEach((t,i)=>{
    const row = document.createElement("div");
    row.className = "flag-item";
    row.innerHTML = `
      <span class="flag-time">⧉ ${formatTime(t)}</span>
      <span class="flag-del">✖</span>
    `;
    row.querySelector(".flag-del").onclick = () => {
      flags.splice(i,1);
      renderFlags();
    };
    row.onclick = () => player.currentTime = t;
    flagList.appendChild(row);
  });
}

function formatTime(sec){
  const m = Math.floor(sec/60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2,"0")}`;
}

// ===== NOTES =====
const notes = document.getElementById("notes");
document.getElementById("btn-save").onclick = () => {
  console.log("Notes saved:", notes.value);
};

// ===== EXPORT TO RECON =====
document.getElementById("btn-export").onclick = () => {
  const payload = {
    file,
    flags,
    notes: notes.value,
    exportedAt: new Date().toISOString()
  };

  // Next: ROUTE this to Recon (localStorage, Firestore, or URL param)
  console.log("EXPORT → RECON", payload);
};
