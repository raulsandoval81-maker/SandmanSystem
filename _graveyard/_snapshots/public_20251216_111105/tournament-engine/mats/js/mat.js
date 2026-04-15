import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-app.js";
import { getFirestore, doc, setDoc } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "YOUR-KEY",
  authDomain: "YOUR-DOMAIN",
  projectId: "YOUR-ID"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const mat = document.body.dataset.mat;

const red = document.getElementById("red-score");
const green = document.getElementById("green-score");
const period = document.getElementById("period");
const timerEl = document.getElementById("timer");

let time = 120;
let interval = null;

// -----------------------------------------
// PUSH TO FIRESTORE
// -----------------------------------------
function push(){
  setDoc(doc(db, "tournament", "mats"), {
    [mat]: {
      red: Number(red.textContent),
      green: Number(green.textContent),
      period: period.value,
      time: timerEl.textContent,
      running: interval !== null
    }
  }, { merge:true });
}

// -----------------------------------------
// TIMER
// -----------------------------------------
function updateTimer(){
  const m = Math.floor(time/60);
  const s = String(time%60).padStart(2,"0");
  timerEl.textContent = `${m}:${s}`;
  push();
}

// PRESETS
document.querySelectorAll(".preset").forEach(btn=>{
  btn.onclick = () => {
    time = Number(btn.dataset.time);
    updateTimer();
  };
});

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

// -----------------------------------------
// SCORING
// -----------------------------------------
function checkTech(){
  const r = Number(red.textContent);
  const g = Number(green.textContent);

  if(Math.abs(r - g) >= 15){
    const winner = r > g ? "RED" : "GREEN";
    if(confirm(`Tech Fall — Confirm ${winner}?`)){
      setDoc(doc(db,"tournament","mats"),{
        [mat]:{ winner }
      },{merge:true});
    }
  }
}

["red","green"].forEach(color => {
  [1,2,3].forEach(v=>{
    document.querySelector(`[data-add='${color}-${v}']`).onclick = () => {
      const box = document.getElementById(`${color}-score`);
      box.textContent = Number(box.textContent) + v;
      checkTech();
      push();
    };
  });
});

// -----------------------------------------
// PIN
// -----------------------------------------
document.getElementById("pin-red").onclick = () => {
  if(confirm("Confirm PIN — RED wins?")){
    setDoc(doc(db,"tournament","mats"),{[mat]:{winner:"RED"}},{merge:true});
  }
};
document.getElementById("pin-green").onclick = () => {
  if(confirm("Confirm PIN — GREEN wins?")){
    setDoc(doc(db,"tournament","mats"),{[mat]:{winner:"GREEN"}},{merge:true});
  }
};

// -----------------------------------------
// WIN BUTTONS
// -----------------------------------------
document.getElementById("winner-red").onclick = () => {
  setDoc(doc(db,"tournament","mats"),{[mat]:{winner:"RED"}},{merge:true});
};
document.getElementById("winner-green").onclick = () => {
  setDoc(doc(db,"tournament","mats"),{[mat]:{winner:"GREEN"}},{merge:true});
};

updateTimer();
