import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-app.js";
import { getFirestore, doc, setDoc } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "YOUR-KEY",
  authDomain: "YOUR-DOMAIN",
  projectId: "YOUR-ID"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// read mat number from <body data-mat="1">
const mat = document.body.dataset.mat;

// UI elements
const red = document.getElementById("red-score");
const green = document.getElementById("green-score");
const period = document.getElementById("period");
const timerEl = document.getElementById("timer");

let time = 120;
let interval = null;

// --- FIXED FIRESTORE PATH ---
function push(){
  setDoc(
    doc(db, "tournament", "mats", String(mat)),
    {
      red: Number(red.textContent),
      green: Number(green.textContent),
      period: period.value,
      time: timerEl.textContent,
      running: interval !== null,
    },
    { merge:true }
  );
}

function updateTimer(){
  const m = Math.floor(time/60);
  const s = String(time%60).padStart(2,"0");
  timerEl.textContent = `${m}:${s}`;
  push();
}

document.getElementById("start").onclick = () => {
  if(interval) return;
  interval = setInterval(() => {
    if(time > 0) time--;
    updateTimer();
  },1000);
};

document.getElementById("pause").onclick = () => {
  clearInterval(interval);
  interval = null;
  push();
};

document.getElementById("reset").onclick = () => {
  time = 120;
  updateTimer();
};

period.onchange = push;

["red","green"].forEach(color => {
  [1,2,3].forEach(v=>{
    document.querySelector(`[data-add='${color}-${v}']`).onclick = () => {
      const box = document.getElementById(`${color}-score`);
      box.textContent = Number(box.textContent) + v;
      push();
    };
  });
});

document.getElementById("winner-red").onclick = () => {
  setDoc(
    doc(db, "tournament", "mats", String(mat)),
    { winner:"RED" },
    { merge:true }
  );
};

document.getElementById("winner-green").onclick = () => {
  setDoc(
    doc(db, "tournament", "mats", String(mat)),
    { winner:"GREEN" },
    { merge:true }
  );
};

updateTimer();
