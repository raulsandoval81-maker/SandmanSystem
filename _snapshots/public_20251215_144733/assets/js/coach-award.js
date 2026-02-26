// Coach XP Award Console (local mode). Writes to same key athletes read.
const LS_XP = "xp_entries"; // shared with athlete page
const $ = s => document.querySelector(s);
const $$ = s => Array.from(document.querySelectorAll(s));
const read = (k, f=[]) => { try{ return JSON.parse(localStorage.getItem(k)) ?? f; }catch{ return f; } };
const write = (k,v) => localStorage.setItem(k, JSON.stringify(v));

let xp = read(LS_XP, []);

function addAward(points){
  const name = $('#athlete').value.trim();
  const sport = $('#sport').value;
  const cat   = $('#cat').value;
  const note  = $('#note').value.trim();

  if (!name){ alert('Enter athlete name.'); return; }

  xp.push({ name, sport, category:cat, points:Number(points), note, ts: Date.now() });
  write(LS_XP, xp);

  // UI feedback
  $('#status').textContent = `+${points} XP added to ${name}`;
  setTimeout(()=> $('#status').textContent = 'Local mode. Online later.', 1200);
  $('#note').value = '';

  renderToday();
}

function renderToday(){
  const start = new Date(); start.setHours(0,0,0,0);
  const today = xp.filter(e => e.ts >= start.getTime()).sort((a,b)=>b.ts-a.ts);
  const ul = $('#todayList'); ul.innerHTML='';
  if (!today.length){ ul.innerHTML='<li class="muted">No awards yet today.</li>'; return; }
  today.forEach(e=>{
    const li = document.createElement('li');
    li.innerHTML = `
      <div class="timestamp">${new Date(e.ts).toLocaleString()}</div>
      <div><strong>${e.name}</strong> — +${e.points} XP • ${e.category} • ${e.sport}</div>
      ${e.note? `<div class="muted">“${e.note}”</div>` : ''}
    `;
    ul.appendChild(li);
  });
}

document.addEventListener('DOMContentLoaded', ()=>{
  $$('[data-xp]').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      btn.disabled = true;
      addAward(btn.getAttribute('data-xp'));
      setTimeout(()=> btn.disabled=false, 400);
    });
  });
  renderToday();
});
