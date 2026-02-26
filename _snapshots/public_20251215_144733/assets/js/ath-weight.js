(() => {
  const KEY = 'athWeightLog';
  const GOAL_KEY = 'athWeightGoal';

  const $ = id => document.getElementById(id);
  const wDate = $('wDate'), wValue = $('wValue'), wNote = $('wNote');
  const wSave = $('wSave'), wClearForm = $('wClearForm'), wExport = $('wExport');
  const wTable = $('wTable'), wChart = $('wChart');
  const wGoal = $('wGoal'), wGuide = $('wGuide');

  // Default date = today
  wDate.valueAsDate = new Date();

  /* ---------- Load/Save ---------- */
  const load = () => JSON.parse(localStorage.getItem(KEY) || '[]');
  const save = arr => localStorage.setItem(KEY, JSON.stringify(arr));

  const loadGoal = () => localStorage.getItem(GOAL_KEY) || 'maintain';
  const saveGoal = v => localStorage.setItem(GOAL_KEY, v);

  /* ---------- Guidance ---------- */
  const guideText = {
    maintain: {
      title: 'Maintain — stay steady',
      bullets: [
        'Consistent meals, steady hydration.',
        'Regular sleep and recovery.',
        'Track trends; avoid big swings.'
      ]
    },
    drop_safely: {
      title: 'Drop Safely — be smart',
      bullets: [
        'Small, gradual changes; avoid extremes.',
        'Hydrate well; don’t skip fueling around training.',
        'Coordinate with coach; follow event rules.'
      ]
    },
    gain_muscle: {
      title: 'Gain Muscle — build quality',
      bullets: [
        'Adequate protein and total calories.',
        'Progressive strength + good sleep.',
        'Track weight & performance together.'
      ]
    }
  };

  function renderGuide(goal) {
    const g = guideText[goal] || guideText.maintain;
    wGuide.innerHTML = `
      <h4>${g.title}</h4>
      <ul>${g.bullets.map(b=>`<li>${b}</li>`).join('')}</ul>
    `;
  }

  /* ---------- Table ---------- */
  function renderTable(rowsSortedDesc) {
    if (!rowsSortedDesc.length) {
      wTable.innerHTML = `<tr><td colspan="5" class="muted">No entries yet.</td></tr>`;
      return;
    }
    wTable.innerHTML = rowsSortedDesc.map((r,i) => `
      <tr>
        <td>${r.date}</td>
        <td>${r.weight}</td>
        <td>${labelForGoal(r.goal)}</td>
        <td>${escapeHtml(r.note || '')}</td>
        <td><button data-i="${i}" class="del">Delete</button></td>
      </tr>`).join('');
    wTable.querySelectorAll('.del').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = +btn.dataset.i;
        const all = load().sort((a,b)=>b.ts - a.ts);
        all.splice(idx,1);
        save(all);
        render();
      });
    });
  }

  function labelForGoal(v){
    if (v === 'drop_safely') return 'Drop Safely';
    if (v === 'gain_muscle') return 'Gain Muscle';
    return 'Maintain';
  }

  /* ---------- Chart ---------- */
  function renderChart(rowsAsc) {
    const ctx = wChart.getContext('2d');
    ctx.clearRect(0, 0, wChart.width, wChart.height);

    if (!rowsAsc.length) {
      ctx.fillStyle = '#9aa3ad';
      ctx.font = '12px system-ui, sans-serif';
      ctx.fillText('No data yet', 12, 20);
      return;
    }

    const points = rowsAsc.map(r => ({
      x: new Date(r.date).getTime(),
      y: parseFloat(r.weight)
    })).filter(p => !Number.isNaN(p.x) && !Number.isNaN(p.y));
    if (!points.length) return;

    const minX = Math.min(...points.map(p => p.x));
    const maxX = Math.max(...points.map(p => p.x));
    let minY = Math.min(...points.map(p => p.y));
    let maxY = Math.max(...points.map(p => p.y));
    if (minY === maxY) { minY -= 1; maxY += 1; }

    const padL = 36, padR = 10, padT = 16, padB = 28;
    const W = wChart.width, H = wChart.height;
    const innerW = W - padL - padR;
    const innerH = H - padT - padB;

    const xScale = x => padL + ( (maxX === minX) ? innerW/2 : ((x - minX) / (maxX - minX)) * innerW );
    const yScale = y => padT + (1 - ( (y - minY) / (maxY - minY) )) * innerH;

    // Gridlines
    const grid = '#e6e8ec';
    ctx.strokeStyle = grid; ctx.lineWidth = 1; ctx.beginPath();
    for (let i = 0; i <= 4; i++) {
      const y = padT + (i/4) * innerH;
      ctx.moveTo(padL, y); ctx.lineTo(W - padR, y);
    }
    ctx.stroke();

    // Y labels
    ctx.fillStyle = '#6b7280'; ctx.font = '11px system-ui, sans-serif';
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    for (let i = 0; i <= 4; i++) {
      const val = (maxY - ((maxY - minY) * (i/4))).toFixed(1);
      const y = padT + (i/4) * innerH;
      ctx.fillText(val, padL - 6, y);
    }

    // Line
    ctx.strokeStyle = '#ef4444';
    ctx.lineWidth = 2; ctx.beginPath();
    points.forEach((p, idx) => {
      const x = xScale(p.x), y = yScale(p.y);
      if (idx === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.stroke();

    // Points
    ctx.fillStyle = '#ef4444';
    points.forEach(p => { const x=xScale(p.x), y=yScale(p.y); ctx.beginPath(); ctx.arc(x,y,3,0,Math.PI*2); ctx.fill(); });

    // X labels
    ctx.fillStyle = '#6b7280'; ctx.font = '11px system-ui, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    const firstLabel = new Date(points[0].x).toLocaleDateString();
    const lastLabel  = new Date(points[points.length-1].x).toLocaleDateString();
    ctx.fillText(firstLabel, xScale(points[0].x), H - padB + 8);
    if (points.length > 1) ctx.fillText(lastLabel, xScale(points[points.length-1].x), H - padB + 8);
  }

  /* ---------- Render orchestrator ---------- */
  function render() {
    const desc = load().sort((a,b)=>b.ts - a.ts);
    const asc  = [...desc].reverse();
    renderTable(desc);
    renderChart(asc);
  }

  /* ---------- CSV ---------- */
  function toCSV() {
    const rows = load().sort((a,b)=>a.ts - b.ts);
    const lines = [['Date','Weight','Goal','Note']].concat(
      rows.map(r => [
        r.date, r.weight, labelForGoal(r.goal), (r.note||'').replace(/"/g,'""')
      ])
    );
    const csv = lines.map(cols => cols.map(c => `"${c}"`).join(',')).join('\n');
    const blob = new Blob([csv], {type:'text/csv'});
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'weight-log.csv';
    a.click();
    URL.revokeObjectURL(a.href);
  }

  /* ---------- Events ---------- */
  wGoal.addEventListener('change', () => {
    saveGoal(wGoal.value);
    renderGuide(wGoal.value);
  });

  wSave.addEventListener('click', () => {
    const date = wDate.value || new Date().toISOString().slice(0,10);
    const weight = (wValue.value || '').trim();
    if (!weight) return alert('Enter a weight.');
    const note = (wNote.value || '').trim();
    const goal = wGoal.value || 'maintain';

    const arr = load();
    arr.push({ ts: Date.now(), date, weight, goal, note });
    save(arr);
    wNote.value = ''; // keep date/weight for rapid entries
    render();
  });

  wClearForm.addEventListener('click', () => { wValue.value=''; wNote.value=''; });
  wExport.addEventListener('click', toCSV);

  /* ---------- Init ---------- */
  // goal preference
  const initialGoal = loadGoal();
  wGoal.value = initialGoal;
  renderGuide(initialGoal);

  render();
  console.log('[Athletes] Weight Management ready (goal-aware + chart + localStorage).');

  /* ---------- Utils ---------- */
  function escapeHtml(s){ return (s||'').replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
})();
