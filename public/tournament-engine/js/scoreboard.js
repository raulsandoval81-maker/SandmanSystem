import { initializeApp }
  from "https://www.gstatic.com/firebasejs/10.7.0/firebase-app.js";
import {
  getFirestore, doc, onSnapshot
} from "https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey:"YOUR_KEY",
  authDomain:"YOUR_DOMAIN",
  projectId:"YOUR_PROJECT_ID"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// URL PARAMS
const url = new URL(location.href);
const eventId = url.searchParams.get("event");
const matId = url.searchParams.get("mat");

document.body.dataset.event = eventId;
document.body.dataset.mat = matId;
document.getElementById("mat-id").textContent = matId;

// PATH
const path = doc(db, `tournament/events/${eventId}/mats/mat${matId}`);

const redEl = document.getElementById("red-score");
const greenEl = document.getElementById("green-score");

const timerEl = document.getElementById("timer");
const periodEl = document.getElementById("period");

const refEl = document.getElementById("ref-time");
const bloodEl = document.getElementById("blood-time");
const injEl = document.getElementById("injury-time");

const winnerBar = document.getElementById("winner-bar");

function fmtTime(sec){
  const m = Math.floor(sec/60);
  const s = String(sec%60).padStart(2,"0");
  return `${m}:${s}`;
}

// LISTEN REAL-TIME
onSnapshot(path, snap=>{
  const d = snap.data();
  if(!d) return;

  redEl.textContent = d.red ?? 0;
  greenEl.textContent = d.green ?? 0;

  timerEl.textContent = d.time ?? "0:00";
  periodEl.textContent = (()=>{
    const p = d.period;
    if(p==="sv") return "SV";
    if(p==="tb1") return "TB1";
    if(p==="tb2") return "TB2";
    if(p==="utb") return "UTB";
    return `${p}`;
  })();

  if(d.special){
    refEl.textContent   = fmtTime(d.special.ref);
    bloodEl.textContent = fmtTime(d.special.blood);
    injEl.textContent   = fmtTime(d.special.injury);
  }

  if(d.winner){
    winnerBar.textContent =
      d.winner === "RED" ? "RED WINS" : "GREEN WINS";
    winnerBar.style.background =
      d.winner === "RED" ? "#7f1d1d" : "#064e3b";
  } else {
    winnerBar.textContent = "";
    winnerBar.style.background = "#1e293b";
  }
});
