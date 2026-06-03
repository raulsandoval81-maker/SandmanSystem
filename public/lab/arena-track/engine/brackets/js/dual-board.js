// TEAM INPUTS
const teamInputs = [...document.querySelectorAll(".team-input")];

// ROUND ROBIN MATCHUPS (6 teams = 15 duals)
const PAIRS = [
  [0,5],[1,4],[2,3],
  [0,4],[5,3],[1,2],
  [0,3],[4,2],[5,1],
  [0,2],[3,1],[4,5],
  [0,1],[2,5],[3,4]
];

const dualsBody = document.getElementById("duals-body");
const standingsBody = document.getElementById("standings-body");

let teams = teamInputs.map(el => el.value);

// SCORE DATA STRUCTURE
let results = PAIRS.map(() => ({
  aScore: "",
  bScore: "",
  winner: ""
}));

// --- BUILD DUAL TABLE ---
function buildDualTable() {
  dualsBody.innerHTML = "";

  PAIRS.forEach(([A,B], i) => {
    const row = document.createElement("tr");

    row.innerHTML = `
      <td>${i+1}</td>
      <td>${teams[A]} vs ${teams[B]}</td>
      <td><input data-idx="${i}" data-side="a" value="${results[i].aScore}" /></td>
      <td><input data-idx="${i}" data-side="b" value="${results[i].bScore}" /></td>
      <td><span id="w${i}" class="winner-cell">${results[i].winner}</span></td>
    `;

    dualsBody.appendChild(row);
  });

  // Bind score inputs
  document.querySelectorAll("input[data-idx]").forEach(input => {
    input.addEventListener("input", e => {
      const idx = Number(e.target.dataset.idx);
      const side = e.target.dataset.side;
      results[idx][side + "Score"] = e.target.value;
      computeWinners();
    });
  });
}

// --- WINNER LOGIC ---
function computeWinners() {
  results.forEach((d,i) => {
    const A = Number(d.aScore);
    const B = Number(d.bScore);

    if(isNaN(A) || isNaN(B) || d.aScore === "" || d.bScore === "") {
      d.winner = "";
    } else if(A > B) {
      d.winner = "A";
    } else if(B > A) {
      d.winner = "B";
    } else {
      d.winner = "T";
    }

    document.getElementById("w"+i).textContent = d.winner;
  });

  computeStandings();
}

// --- STANDINGS ---
function computeStandings() {
  let table = teams.map((name,i)=>({
    name,
    w:0,
    l:0,
    pf:0,
    pa:0,
    diff:0,
    idx:i
  }));

  results.forEach((d,i) => {
    const [A,B] = PAIRS[i];
    if(d.aScore === "" || d.bScore === "") return;

    const a = Number(d.aScore);
    const b = Number(d.bScore);

    table[A].pf += a;
    table[A].pa += b;
    table[B].pf += b;
    table[B].pa += a;

    if(a > b) { table[A].w++; table[B].l++; }
    else if(b > a) { table[B].w++; table[A].l++; }
  });

  table.forEach(t => t.diff = t.pf - t.pa);

  table.sort((a,b) =>
    b.w - a.w ||
    b.diff - a.diff ||
    b.pf - a.pf
  );

  standingsBody.innerHTML = "";

  table.forEach((t,i)=>{
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${i+1}</td>
      <td>${t.name}</td>
      <td>${t.w}</td>
      <td>${t.l}</td>
      <td>${t.pf}</td>
      <td>${t.pa}</td>
      <td>${t.diff}</td>
    `;
    standingsBody.appendChild(row);
  });
}

// --- TEAM NAME LIVE UPDATE ---
teamInputs.forEach((input,i)=>{
  input.addEventListener("input", () => {
    teams[i] = input.value;
    buildDualTable();
    computeWinners();
  });
});

// INITIAL BUILD
buildDualTable();
computeWinners();
