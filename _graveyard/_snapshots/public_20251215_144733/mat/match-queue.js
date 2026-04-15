const queueList = document.getElementById('queue-list');

const matches = [
  { bout: 14, red: "SANDOVAL", green: "MARTINEZ", weight: "145" },
  { bout: 15, red: "KERN", green: "REYES", weight: "152" },
  { bout: 16, red: "SMITH", green: "JOHNSON", weight: "160" },
  { bout: 17, red: "HERNANDEZ", green: "RAMIREZ", weight: "170" },
  { bout: 18, red: "ROGERS", green: "BROWN", weight: "182" }
];

function loadQueue() {
  queueList.innerHTML = "";
  matches.forEach(m => {
    const row = document.createElement('div');
    row.className = "queue-item";
    row.innerHTML = `
      <div class="q-left">
        <div class="bout">Bout ${m.bout}</div>
        <div class="names">${m.red} vs ${m.green}</div>
      </div>
      <div class="q-right">${m.weight}</div>
    `;

    row.onclick = () => {
      localStorage.setItem("mat-current-match", JSON.stringify(m));
      window.location.href = "mat-console.html";
    };

    queueList.appendChild(row);
  });
}

loadQueue();
