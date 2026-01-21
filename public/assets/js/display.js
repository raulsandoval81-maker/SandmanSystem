import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-app.js";
import { getFirestore, collection, onSnapshot } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey:"YOUR-KEY",
  authDomain:"YOUR-DOMAIN",
  projectId:"YOUR-ID"
};
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const grid = document.getElementById("display");

onSnapshot(collection(db,"tournament/mats"), snap=>{
  grid.innerHTML = "";
  snap.forEach(doc=>{
    const d = doc.data();
    const div = document.createElement("div");
    div.className = "mat-card";

    div.innerHTML = `
      <div class="title">${doc.id.toUpperCase()}</div>
      <div>Period: ${d.period || "-"}</div>
      <div class="timer">${d.time || "0:00"}</div>
      <div class="score">Red: ${d.red ?? 0} — Green: ${d.green ?? 0}</div>
      <div class="winner">${d.winner ? "Winner: "+d.winner : ""}</div>
    `;

    grid.appendChild(div);
  });
});
