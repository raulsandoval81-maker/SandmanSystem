// Lompoc Wrestling Bracket Manager
// - 8- and 16-man single elimination
// - 3rd-place match (semifinal losers)
// - LocalStorage persistence

const eventInput = document.getElementById('eventName');
const weightInput = document.getElementById('weightClass');
const sizeSelect = document.getElementById('bracketSize');
const seedTableBody = document.getElementById('seedTableBody');
const btnNew = document.getElementById('btnNewBracket');
const btnLoad = document.getElementById('btnLoadSaved');
const bracketView = document.getElementById('bracketView');
const entryPanel = document.getElementById('entryPanel');

let state = {
  size: 8,
  event: 'Brave Challenge',
  weight: '',
  seeds: [], // [ { seed, name } ]
  matches: {}, // id -> { id, label, round, boutNumber, a, b, winnerId, loserId, winnerFrom, loserFrom }
  selectedMatchId: null,
};

// --- Helpers: bracket definitions (structure only) ---

function makeBracketDef(size) {
  if (size === 8) {
    // 8-man: QF, SF, F, 3rd (semi losers)
    return [
      // Quarterfinals
      { id: 'QF1', round: 'Quarterfinals', label: 'Quarterfinal 1', boutNumber: 1, seedA: 1, seedB: 8 },
      { id: 'QF2', round: 'Quarterfinals', label: 'Quarterfinal 2', boutNumber: 2, seedA: 4, seedB: 5 },
      { id: 'QF3', round: 'Quarterfinals', label: 'Quarterfinal 3', boutNumber: 3, seedA: 3, seedB: 6 },
      { id: 'QF4', round: 'Quarterfinals', label: 'Quarterfinal 4', boutNumber: 4, seedA: 2, seedB: 7 },
      // Semifinals
      { id: 'SF1', round: 'Semifinals', label: 'Semifinal 1', boutNumber: 5, winnerFromA: 'QF1', winnerFromB: 'QF2' },
      { id: 'SF2', round: 'Semifinals', label: 'Semifinal 2', boutNumber: 6, winnerFromA: 'QF3', winnerFromB: 'QF4' },
      // Finals
      { id: 'F', round: 'Finals', label: 'Championship', boutNumber: 7, winnerFromA: 'SF1', winnerFromB: 'SF2' },
      // 3rd place = losers of SF
      { id: '3RD', round: 'Placement', label: '3rd Place', boutNumber: 8, loserFromA: 'SF1', loserFromB: 'SF2' },
    ];
  } else if (size === 16) {
    // 16-man: Round of 16, QF, SF, F, 3rd (semi losers)
    return [
      // Round of 16
      { id: 'R1M1', round: 'Round of 16', label: 'Round 1', boutNumber: 1, seedA: 1, seedB: 16 },
      { id: 'R1M2', round: 'Round of 16', label: 'Round 1', boutNumber: 2, seedA: 8, seedB: 9 },
      { id: 'R1M3', round: 'Round of 16', label: 'Round 1', boutNumber: 3, seedA: 5, seedB: 12 },
      { id: 'R1M4', round: 'Round of 16', label: 'Round 1', boutNumber: 4, seedA: 4, seedB: 13 },
      { id: 'R1M5', round: 'Round of 16', label: 'Round 1', boutNumber: 5, seedA: 3, seedB: 14 },
      { id: 'R1M6', round: 'Round of 16', label: 'Round 1', boutNumber: 6, seedA: 6, seedB: 11 },
      { id: 'R1M7', round: 'Round of 16', label: 'Round 1', boutNumber: 7, seedA: 7, seedB: 10 },
      { id: 'R1M8', round: 'Round of 16', label: 'Round 1', boutNumber: 8, seedA: 2, seedB: 15 },

      // Quarterfinals
      { id: 'QF1', round: 'Quarterfinals', label: 'Quarterfinal 1', boutNumber: 9, winnerFromA: 'R1M1', winnerFromB: 'R1M2' },
      { id: 'QF2', round: 'Quarterfinals', label: 'Quarterfinal 2', boutNumber: 10, winnerFromA: 'R1M3', winnerFromB: 'R1M4' },
      { id: 'QF3', round: 'Quarterfinals', label: 'Quarterfinal 3', boutNumber: 11, winnerFromA: 'R1M5', winnerFromB: 'R1M6' },
      { id: 'QF4', round: 'Quarterfinals', label: 'Quarterfinal 4', boutNumber: 12, winnerFromA: 'R1M7', winnerFromB: 'R1M8' },

      // Semifinals
      { id: 'SF1', round: 'Semifinals', label: 'Semifinal 1', boutNumber: 13, winnerFromA: 'QF1', winnerFromB: 'QF2' },
      { id: 'SF2', round: 'Semifinals', label: 'Semifinal 2', boutNumber: 14, winnerFromA: 'QF3', winnerFromB: 'QF4' },

      // Finals
      { id: 'F', round: 'Finals', label: 'Championship', boutNumber: 15, winnerFromA: 'SF1', winnerFromB: 'SF2' },

      // 3rd place (semi losers)
      { id: '3RD', round: 'Placement', label: '3rd Place', boutNumber: 16, loserFromA: 'SF1', loserFromB: 'SF2' },
    ];
  }
  return [];
}

// --- Seeds table ---

function renderSeedTable(size) {
  seedTableBody.innerHTML = '';
  for (let i = 1; i <= size; i++) {
    const tr = document.createElement('tr');

    const tdSeed = document.createElement('td');
    tdSeed.textContent = i;
    tdSeed.style.width = '40px';

    const tdName = document.createElement('td');
    const input = document.createElement('input');
    input.type = 'text';
    input.dataset.seed = String(i);
    input.style.width = '100%';
    input.style.border = 'none';
    input.style.outline = 'none';
    input.style.fontSize = '.78rem';
    tdName.appendChild(input);

    tr.appendChild(tdSeed);
    tr.appendChild(tdName);
    seedTableBody.appendChild(tr);
  }
}

function readSeedsFromInputs() {
  const inputs = seedTableBody.querySelectorAll('input[data-seed]');
  const seeds = [];
  inputs.forEach((el) => {
    const seed = parseInt(el.dataset.seed, 10);
    const name = el.value.trim();
    seeds.push({ seed, name });
  });
  return seeds;
}

function applySeedsToInputs(seeds) {
  seeds.forEach((s) => {
    const el = seedTableBody.querySelector(`input[data-seed="${s.seed}"]`);
    if (el) el.value = s.name || '';
  });
}

// --- State persistence ---

function storageKey() {
  const weight = weightInput.value.trim() || 'ALL';
  const size = sizeSelect.value;
  return `lompocBracket_${size}_${weight}`;
}

function saveState() {
  const key = storageKey();
  const payload = JSON.stringify(state);
  localStorage.setItem(key, payload);
}

function loadState() {
  const key = storageKey();
  const raw = localStorage.getItem(key);
  if (!raw) return false;
  try {
    const parsed = JSON.parse(raw);
    state = parsed;
    return true;
  } catch (e) {
    console.error('Failed to parse saved state', e);
    return false;
  }
}

// --- Initialize bracket state from seeds & defs ---

function buildInitialMatches(size, seeds) {
  const def = makeBracketDef(size);
  const matches = {};

  const seedLookup = new Map();
  seeds.forEach((s) => seedLookup.set(s.seed, s.name));

  def.forEach((m) => {
    const match = {
      id: m.id,
      label: m.label,
      round: m.round,
      boutNumber: m.boutNumber,
      a: null,
      b: null,
      winnerId: null,
      loserId: null,
      score: null,
      winType: null,
      time: null,
      winnerFromA: m.winnerFromA || null,
      winnerFromB: m.winnerFromB || null,
      loserFromA: m.loserFromA || null,
      loserFromB: m.loserFromB || null,
    };

    if (m.seedA) {
      match.a = { seed: m.seedA, name: seedLookup.get(m.seedA) || `Seed ${m.seedA}` };
    }
    if (m.seedB) {
      match.b = { seed: m.seedB, name: seedLookup.get(m.seedB) || `Seed ${m.seedB}` };
    }

    matches[match.id] = match;
  });

  return matches;
}

// --- Bracket advancement ---

function propagateFromMatch(matchId) {
  const match = state.matches[matchId];
  if (!match || !match.winnerId || !match.loserId) return;

  // find destinations
  Object.values(state.matches).forEach((m) => {
    if (m.winnerFromA === matchId) {
      m.a = { ...match.winnerId };
    }
    if (m.winnerFromB === matchId) {
      m.b = { ...match.winnerId };
    }
    if (m.loserFromA === matchId) {
      m.a = { ...match.loserId };
    }
    if (m.loserFromB === matchId) {
      m.b = { ...match.loserId };
    }
  });
}

// --- Render bracket ---

function groupMatchesByRound() {
  const byRound = new Map();
  Object.values(state.matches).forEach((m) => {
    if (!byRound.has(m.round)) byRound.set(m.round, []);
    byRound.get(m.round).push(m);
  });
  // preserve order: R16 -> QF -> SF -> F -> Placement
  const order = ['Round of 16', 'Quarterfinals', 'Semifinals', 'Finals', 'Placement'];
  const groups = [];
  order.forEach((round) => {
    if (byRound.has(round)) {
      const arr = byRound.get(round).slice().sort((a, b) => a.boutNumber - b.boutNumber);
      groups.push({ round, matches: arr });
    }
  });
  return groups;
}

function renderBracket() {
  bracketView.innerHTML = '';
  const groups = groupMatchesByRound();
  if (!groups.length) {
    const div = document.createElement('div');
    div.className = 'empty';
    div.textContent = 'No bracket yet. Set seeds and click “Start New Bracket”.';
    bracketView.appendChild(div);
    return;
  }

  const grid = document.createElement('div');
  grid.className = 'bracket-grid';

  groups.forEach((group) => {
    const col = document.createElement('div');
    col.className = 'round-col';

    const title = document.createElement('div');
    title.textContent = group.round;
    title.style.fontSize = '.7rem';
    title.style.textTransform = 'uppercase';
    title.style.letterSpacing = '.09em';
    title.style.color = '#6b7280';
    title.style.marginBottom = '2px';
    col.appendChild(title);

    group.matches.forEach((m) => {
      const card = document.createElement('div');
      card.className = 'match-card';
      if (m.id === state.selectedMatchId) {
        card.classList.add('selected');
      }
      card.dataset.matchId = m.id;

      const head = document.createElement('div');
      head.className = 'match-head';
      head.innerHTML = `<span>Bout ${m.boutNumber}</span><span>${m.id}</span>`;
      card.appendChild(head);

      const line1 = document.createElement('div');
      line1.className = 'match-line';
      line1.innerHTML = `
        <span class="name">${m.a ? m.a.name : 'TBD'}</span>
        <span class="seed">${m.a && m.a.seed ? `#${m.a.seed}` : ''}</span>
      `;
      card.appendChild(line1);

      const line2 = document.createElement('div');
      line2.className = 'match-line';
      line2.innerHTML = `
        <span class="name">${m.b ? m.b.name : 'TBD'}</span>
        <span class="seed">${m.b && m.b.seed ? `#${m.b.seed}` : ''}</span>
      `;
      card.appendChild(line2);

      if (m.winnerId) {
        const tag = document.createElement('div');
        tag.className = 'winner-tag';
        tag.textContent = `Winner: ${m.winnerId.name} (${m.score || ''} ${m.winType || ''})`;
        card.appendChild(tag);
      }

      card.addEventListener('click', () => {
        state.selectedMatchId = m.id;
        renderBracket();
        renderEntryPanel();
      });

      col.appendChild(card);
    });

    grid.appendChild(col);
  });

  bracketView.appendChild(grid);
}

// --- Entry panel ---

function renderEntryPanel() {
  entryPanel.innerHTML = '';

  const match = state.matches[state.selectedMatchId];
  if (!match) {
    const div = document.createElement('div');
    div.className = 'empty';
    div.textContent = 'Click a bout in the bracket to enter the result.';
    entryPanel.appendChild(div);
    return;
  }

  const body = document.createElement('div');
  body.className = 'entry-body';

  const meta = document.createElement('div');
  meta.className = 'entry-meta';
  meta.innerHTML = `
    <div><strong>Bout ${match.boutNumber}</strong> · ${match.round}</div>
    <div>ID: ${match.id}</div>
  `;
  body.appendChild(meta);

  const names = document.createElement('div');
  names.className = 'entry-names';
  names.innerHTML = `
    <div><span class="label">Red / A</span> ${match.a ? match.a.name : 'TBD'}</div>
    <div><span class="label">Green / B</span> ${match.b ? match.b.name : 'TBD'}</div>
  `;
  body.appendChild(names);

  const rowWinner = document.createElement('div');
  rowWinner.className = 'entry-row';
  rowWinner.innerHTML = `
    <label>Winner</label>
    <select id="entryWinner">
      <option value="">Select...</option>
      <option value="A">${match.a ? match.a.name : 'A (TBD)'}</option>
      <option value="B">${match.b ? match.b.name : 'B (TBD)'}</option>
    </select>
  `;
  body.appendChild(rowWinner);

  const rowScore = document.createElement('div');
  rowScore.className = 'entry-row';
  rowScore.innerHTML = `
    <label>Match Score (e.g. 7–3)</label>
    <input id="entryScore" type="text" value="${match.score || ''}" />
  `;
  body.appendChild(rowScore);

  const rowType = document.createElement('div');
  rowType.className = 'entry-row';
  rowType.innerHTML = `
    <label>Result Type</label>
    <select id="entryType">
      <option value="">Select...</option>
      <option value="Dec" ${match.winType === 'Dec' ? 'selected' : ''}>Decision</option>
      <option value="Maj" ${match.winType === 'Maj' ? 'selected' : ''}>Major</option>
      <option value="Tech" ${match.winType === 'Tech' ? 'selected' : ''}>Tech Fall</option>
      <option value="Fall" ${match.winType === 'Fall' ? 'selected' : ''}>Fall</option>
      <option value="FFT" ${match.winType === 'FFT' ? 'selected' : ''}>Forfeit</option>
    </select>
  `;
  body.appendChild(rowType);

  const rowTime = document.createElement('div');
  rowTime.className = 'entry-row';
  rowTime.innerHTML = `
    <label>Fall / Tech Time (optional)</label>
    <input id="entryTime" type="text" placeholder="e.g. 2:31" value="${match.time || ''}" />
  `;
  body.appendChild(rowTime);

  const actions = document.createElement('div');
  actions.className = 'entry-actions';
  const btnSave = document.createElement('button');
  btnSave.className = 'btn btn-primary btn-sm';
  btnSave.textContent = 'Save Result';

  const btnClear = document.createElement('button');
  btnClear.className = 'btn btn-sm';
  btnClear.textContent = 'Clear Result';

  actions.appendChild(btnSave);
  actions.appendChild(btnClear);
  body.appendChild(actions);

  const note = document.createElement('div');
  note.className = 'entry-note';
  note.textContent = 'Use the paper bout sheet during the match. Afterhand, enter the final result here.';
  body.appendChild(note);

  entryPanel.appendChild(body);

  // wire buttons
  const winnerSel = body.querySelector('#entryWinner');
  const scoreInput = body.querySelector('#entryScore');
  const typeSel = body.querySelector('#entryType');
  const timeInput = body.querySelector('#entryTime');

  btnSave.addEventListener('click', () => {
    if (!match.a || !match.b) {
      alert('Both wrestlers must be assigned before saving a result.');
      return;
    }
    const winnerChoice = winnerSel.value;
    if (!winnerChoice) {
      alert('Select a winner.');
      return;
    }
    const winner = winnerChoice === 'A' ? match.a : match.b;
    const loser = winnerChoice === 'A' ? match.b : match.a;

    match.winnerId = { ...winner };
    match.loserId = { ...loser };
    match.score = scoreInput.value.trim() || null;
    match.winType = typeSel.value || null;
    match.time = timeInput.value.trim() || null;

    // propagate to downstream matches
    propagateFromMatch(match.id);

    saveState();
    renderBracket();
    renderEntryPanel();
  });

  btnClear.addEventListener('click', () => {
    match.winnerId = null;
    match.loserId = null;
    match.score = null;
    match.winType = null;
    match.time = null;

    // Clearing does not auto-clear downstream matches (coach manually adjusts).
    saveState();
    renderBracket();
    renderEntryPanel();
  });
}

// --- Event hooks ---

sizeSelect.addEventListener('change', () => {
  const size = parseInt(sizeSelect.value, 10);
  state.size = size;
  renderSeedTable(size);
});

btnNew.addEventListener('click', () => {
  const size = parseInt(sizeSelect.value, 10);
  const seeds = readSeedsFromInputs();

  state = {
    size,
    event: eventInput.value.trim() || 'Event',
    weight: weightInput.value.trim(),
    seeds,
    matches: buildInitialMatches(size, seeds),
    selectedMatchId: null,
  };

  saveState();
  renderBracket();
  renderEntryPanel();
});

btnLoad.addEventListener('click', () => {
  const ok = loadState();
  if (!ok) {
    alert('No saved bracket found for this weight/size.');
    return;
  }
  // sync controls & seeds
  sizeSelect.value = String(state.size || 8);
  renderSeedTable(state.size || 8);
  eventInput.value = state.event || 'Event';
  weightInput.value = state.weight || '';
  applySeedsToInputs(state.seeds || []);
  renderBracket();
  renderEntryPanel();
});

// Initial UI setup
(function init() {
  const size = parseInt(sizeSelect.value, 10) || 8;
  renderSeedTable(size);
})();
