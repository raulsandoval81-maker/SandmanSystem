// --- Header wiring (same as other pages) ---
const preset = document.getElementById('eventPreset');
const eventInput = document.getElementById('eventNameInput');
const eventDisplay = document.getElementById('eventNameDisplay');
const metaInput = document.getElementById('metaInput');
const metaDisplay = document.getElementById('metaDisplay');

function updateEventName() {
  const name = eventInput.value.trim() || 'Event Name';
  eventDisplay.textContent = name.toUpperCase();
}
function updateMeta() {
  metaDisplay.textContent =
    metaInput.value.trim() || 'Division • 6-Team Round Robin Duals';
}

preset.addEventListener('change', () => {
  eventInput.value = preset.value;
  updateEventName();
});
eventInput.addEventListener('input', updateEventName);
metaInput.addEventListener('input', updateMeta);

updateEventName();
updateMeta();

// --- TEAMS (LOCKED BRAVE CHALLENGE LIST) ---
const teams = [
  'Santa Maria High School',
  'Righetti High School',
  'San Luis Obispo High School',
  'Nipomo High School',
  'Lompoc High School – Team A',
  'Lompoc High School – Team B',
];

// --- SIMPLE TEAM STATS MODEL (IN-MEMORY ONLY) ---
const teamStats = teams.map((name) => ({
  name,
  wins: 0,
  losses: 0,
  pf: 0, // points for
  pa: 0, // points against
}));

const postedDuals = new Set(); // track which bout numbers already posted

const standingsBody = document.querySelector('#bcStandings tbody');

function repaintStandings() {
  standingsBody.innerHTML = '';
  teamStats.forEach((stats, idx) => {
    const tr = document.createElement('tr');

    const rankTd = document.createElement('td');
    rankTd.textContent = idx + 1;
    tr.appendChild(rankTd);

    const teamTd = document.createElement('td');
    teamTd.className = 'team';
    teamTd.textContent = `(${idx + 1}) ${stats.name}`;
    tr.appendChild(teamTd);

    const wTd = document.createElement('td');
    wTd.textContent = stats.wins;
    tr.appendChild(wTd);

    const lTd = document.createElement('td');
    lTd.textContent = stats.losses;
    tr.appendChild(lTd);

    const pfTd = document.createElement('td');
    pfTd.textContent = stats.pf;
    tr.appendChild(pfTd);

    const paTd = document.createElement('td');
    paTd.textContent = stats.pa;
    tr.appendChild(paTd);

    standingsBody.appendChild(tr);
  });
}

function applyDualResult(homeIdx, awayIdx, homeScore, awayScore, boutNumber) {
  if (postedDuals.has(boutNumber)) {
    alert(`Bout ${boutNumber} has already been posted to standings.`);
    return;
  }
  postedDuals.add(boutNumber);

  const home = teamStats[homeIdx];
  const away = teamStats[awayIdx];

  home.pf += homeScore;
  home.pa += awayScore;
  away.pf += awayScore;
  away.pa += homeScore;

  if (homeScore > awayScore) {
    home.wins += 1;
    away.losses += 1;
  } else if (awayScore > homeScore) {
    away.wins += 1;
    home.losses += 1;
  }
  // ties ignored for now

  repaintStandings();
}

// initial paint
repaintStandings();

// --- 6-Team Round Robin Pairings (indices 0–5) ---
// 5 rounds, 3 duals per round
const rounds = [
  [[0, 5], [1, 4], [2, 3]], // Round 1
  [[0, 4], [5, 3], [1, 2]], // Round 2
  [[0, 3], [4, 2], [5, 1]], // Round 3
  [[0, 2], [3, 1], [4, 5]], // Round 4
  [[0, 1], [2, 5], [3, 4]], // Round 5
];

// --- MASTER SCHEDULE (WITH BOUT #) ---
const scheduleRoot = document.getElementById('bcSchedule');

rounds.forEach((roundMatches, roundIdx) => {
  const block = document.createElement('div');
  block.className = 'round-block';

  const heading = document.createElement('div');
  heading.className = 'round-heading';
  heading.textContent = `Round ${roundIdx + 1}`;
  block.appendChild(heading);

  roundMatches.forEach((pair, matchIdx) => {
    const [homeIdx, awayIdx] = pair;
    const homeNum = homeIdx + 1;
    const awayNum = awayIdx + 1;
    const boutNumber = (roundIdx + 1) * 100 + (matchIdx + 1); // 101, 102, ...

    const line = document.createElement('div');
    line.className = 'match-line';

    const vsSpan = document.createElement('span');
    vsSpan.className = 'vs';
    vsSpan.textContent =
      `Bout ${boutNumber} — (${homeNum}) ${teams[homeIdx]} vs (${awayNum}) ${teams[awayIdx]}`;

    const matSpan = document.createElement('span');
    matSpan.className = 'mat';
    matSpan.textContent = `Mat ${matchIdx + 1}`;

    line.appendChild(vsSpan);
    line.appendChild(matSpan);
    block.appendChild(line);
  });

  scheduleRoot.appendChild(block);
});

// --- ROSTERS (sub-accordions) ---
const rostersRoot = document.getElementById('bcRosters');

teams.forEach((team, idx) => {
  const teamNum = idx + 1;

  const sub = document.createElement('div');
  sub.className = 'sub-accordion';

  const header = document.createElement('button');
  header.type = 'button';
  header.className = 'sub-header js-sub-accordion-header';
  header.innerHTML = `
    <span class="sub-title">(${teamNum}) ${team}</span>
    <span>
      <span class="sub-tag">Roster</span>
      <span class="sub-chevron">▶</span>
    </span>
  `;

  const body = document.createElement('div');
  body.className = 'sub-body';

  const card = document.createElement('div');
  card.className = 'roster-card';

  const nameEl = document.createElement('div');
  nameEl.className = 'roster-name';
  nameEl.textContent = team; // number is already in header
  card.appendChild(nameEl);

  const metaEl = document.createElement('div');
  metaEl.className = 'roster-meta';
  metaEl.textContent =
    'Coach: __________   |   Phone: __________   |   Email: __________';
  card.appendChild(metaEl);

  const table = document.createElement('table');
  table.className = 'roster';

  const thead = document.createElement('thead');
  thead.innerHTML = `
    <tr>
      <th>Bout / Wt</th>
      <th>Wrestler</th>
      <th>Grade</th>
      <th>Notes</th>
    </tr>
  `;
  table.appendChild(thead);

  const tbody = document.createElement('tbody');
  // 14 lines for a typical dual
  for (let i = 1; i <= 14; i++) {
    const tr = document.createElement('tr');

    const tdBout = document.createElement('td');
    tdBout.textContent = i;

    const tdName = document.createElement('td');
    const tdGrade = document.createElement('td');
    const tdNotes = document.createElement('td');

    tr.appendChild(tdBout);
    tr.appendChild(tdName);
    tr.appendChild(tdGrade);
    tr.appendChild(tdNotes);

    tbody.appendChild(tr);
  }
  table.appendChild(tbody);

  card.appendChild(table);
  body.appendChild(card);

  sub.appendChild(header);
  sub.appendChild(body);
  rostersRoot.appendChild(sub);
});

// --- Helper: calculate dual scores from a dual table ---
function calcDualScores(dualTable) {
  const tbody = dualTable.querySelector('tbody');
  let homeTotal = 0;
  let awayTotal = 0;

  if (!tbody) return { homeTotal, awayTotal };

  Array.from(tbody.rows).forEach((row) => {
    // columns: 0 Bout, 1 Weight, 2 Home, 3 Away, 4 Result, 5 H, 6 A
    const hCell = row.cells[5];
    const aCell = row.cells[6];
    if (!hCell || !aCell) return;

    const hVal = parseInt(hCell.textContent.trim(), 10);
    const aVal = parseInt(aCell.textContent.trim(), 10);

    if (!Number.isNaN(hVal)) homeTotal += hVal;
    if (!Number.isNaN(aVal)) awayTotal += aVal;
  });

  return { homeTotal, awayTotal };
}

// --- DUAL SCORE SHEETS (sub-accordions, one per matchup) ---
const dualsRoot = document.getElementById('bcDuals');

rounds.forEach((roundMatches, roundIdx) => {
  roundMatches.forEach((pair, matchIdx) => {
    const [homeIdx, awayIdx] = pair;
    const homeTeam = teams[homeIdx];
    const awayTeam = teams[awayIdx];
    const homeNum = homeIdx + 1;
    const awayNum = awayIdx + 1;
    const boutNumber = (roundIdx + 1) * 100 + (matchIdx + 1);

    const sub = document.createElement('div');
    sub.className = 'sub-accordion';

    const header = document.createElement('button');
    header.type = 'button';
    header.className = 'sub-header js-sub-accordion-header';
    header.innerHTML = `
      <span class="sub-title">
        Bout ${boutNumber} · Round ${roundIdx + 1} · Mat ${matchIdx + 1} —
        (${homeNum}) ${homeTeam} vs (${awayNum}) ${awayTeam}
      </span>
      <span class="sub-chevron">▶</span>
    `;

    const body = document.createElement('div');
    body.className = 'sub-body';

    const sheet = document.createElement('div');
    sheet.className = 'dual-sheet';

    const top = document.createElement('div');
    top.className = 'dual-header-top';

    const title = document.createElement('div');
    title.className = 'dual-title';
    title.textContent = 'Brave Challenge – Dual Score Sheet';

    const meta = document.createElement('div');
    meta.className = 'dual-meta';
    meta.innerHTML = `
      Bout: ${boutNumber}&nbsp;&nbsp;&nbsp;
      Site: ____________________&nbsp;&nbsp;&nbsp;
      Date: ____________&nbsp;&nbsp;&nbsp;
      Round: ${roundIdx + 1}&nbsp;&nbsp;&nbsp;
      Mat: ${matchIdx + 1}
    `;

    top.appendChild(title);
    top.appendChild(meta);
    sheet.appendChild(top);

    const vs = document.createElement('div');
    vs.className = 'dual-vs';
    vs.innerHTML =
      `<span>(${homeNum}) ${homeTeam}</span> vs ` +
      `<span>(${awayNum}) ${awayTeam}</span>`;
    sheet.appendChild(vs);

    // RUNNING SCORE BAR + BUTTONS
    const scoreBar = document.createElement('div');
    scoreBar.className = 'dual-scorebar';
    scoreBar.style.display = 'flex';
    scoreBar.style.flexWrap = 'wrap';
    scoreBar.style.gap = '6px';
    scoreBar.style.alignItems = 'center';
    scoreBar.style.marginBottom = '6px';

    const scoreText = document.createElement('span');
    scoreText.innerHTML = `
      Running Team Score —
      Home: <span class="dual-score-home">0</span>
      &nbsp;|&nbsp;
      Away: <span class="dual-score-away">0</span>
    `;

    const recalcBtn = document.createElement('button');
    recalcBtn.type = 'button';
    recalcBtn.textContent = 'Recalculate';
    recalcBtn.style.fontSize = '0.72rem';
    recalcBtn.style.padding = '3px 6px';

    const postBtn = document.createElement('button');
    postBtn.type = 'button';
    postBtn.textContent = 'Post dual to standings';
    postBtn.style.fontSize = '0.72rem';
    postBtn.style.padding = '3px 6px';

    scoreBar.appendChild(scoreText);
    scoreBar.appendChild(recalcBtn);
    scoreBar.appendChild(postBtn);
    sheet.appendChild(scoreBar);

    const table = document.createElement('table');
    table.className = 'dual';

    const thead = document.createElement('thead');
    thead.innerHTML = `
      <tr>
        <th>Bout</th>
        <th>Weight</th>
        <th>${homeTeam} Wrestler</th>
        <th>${awayTeam} Wrestler</th>
        <th>Result / Fall Time</th>
        <th>Team Score (H)</th>
        <th>Team Score (A)</th>
      </tr>
    `;
    table.appendChild(thead);

    const tbody = document.createElement('tbody');
    for (let i = 1; i <= 14; i++) {
      const tr = document.createElement('tr');

      const tdBout = document.createElement('td');
      tdBout.textContent = i;

      const tdWt = document.createElement('td');
      tdWt.textContent = ''; // write weight

      const tdHome = document.createElement('td');
      const tdAway = document.createElement('td');
      const tdResult = document.createElement('td');
      const tdHScore = document.createElement('td');
      const tdAScore = document.createElement('td');

      tr.appendChild(tdBout);
      tr.appendChild(tdWt);
      tr.appendChild(tdHome);
      tr.appendChild(tdAway);
      tr.appendChild(tdResult);
      tr.appendChild(tdHScore);
      tr.appendChild(tdAScore);

      tbody.appendChild(tr);
    }
    table.appendChild(tbody);
    sheet.appendChild(table);

    const footer = document.createElement('div');
    footer.className = 'dual-footer';
    footer.innerHTML = `
      <div>Final Team Score – Home: ________  Away: ________</div>
      <div>Official: ______________________ &nbsp;&nbsp; Table: ______________________</div>
    `;
    sheet.appendChild(footer);

    // Hook up buttons
    const homeScoreSpan = scoreText.querySelector('.dual-score-home');
    const awayScoreSpan = scoreText.querySelector('.dual-score-away');

    function handleRecalc() {
      const { homeTotal, awayTotal } = calcDualScores(table);
      homeScoreSpan.textContent = homeTotal;
      awayScoreSpan.textContent = awayTotal;
    }

    function handlePost() {
      const { homeTotal, awayTotal } = calcDualScores(table);
      homeScoreSpan.textContent = homeTotal;
      awayScoreSpan.textContent = awayTotal;

      if (homeTotal === 0 && awayTotal === 0) {
        const ok = confirm(
          `Bout ${boutNumber}: both team scores are 0. Post anyway?`
        );
        if (!ok) return;
      }

      applyDualResult(homeIdx, awayIdx, homeTotal, awayTotal, boutNumber);
      postBtn.disabled = true;
      postBtn.textContent = 'Posted';
    }

    recalcBtn.addEventListener('click', handleRecalc);
    postBtn.addEventListener('click', handlePost);

    body.appendChild(sheet);
    sub.appendChild(header);
    sub.appendChild(body);
    dualsRoot.appendChild(sub);
  });
});

// --- Accordion wiring (top-level + sub) ---
function wireAccordions() {
  // Top-level
  document.querySelectorAll('.js-accordion-header').forEach((btn) => {
    btn.addEventListener('click', () => {
      const acc = btn.closest('.accordion');
      if (!acc) return;
      acc.classList.toggle('open');
    });
  });

  // Sub-level (rosters + duals)
  document.querySelectorAll('.js-sub-accordion-header').forEach((btn) => {
    btn.addEventListener('click', () => {
      const acc = btn.closest('.sub-accordion');
      if (!acc) return;
      acc.classList.toggle('open');
    });
  });
}

wireAccordions();
