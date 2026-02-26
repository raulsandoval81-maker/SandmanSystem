// Coach Notes Composer (local mode). Writes where athlete page reads.
const LS_NOTES = "coachNotes"; // athlete page expects object keyed by athlete name
const $ = s => document.querySelector(s);
const readObj = (k, f={}) => { try{ return JSON.parse(localStorage.getItem(k)) ?? f; }catch{ return f; } };
const write = (k,v) => localStorage.setItem(k, JSON.stringify(v));

let store = readObj(LS_NOTES, {}); // { [name]: [{text, by, tags[], at}, ...] }

function post(){
  const name = $('#nAthlete').value.trim();
  const by   = ($('#nBy').value.trim() || 'Coach');
  const tags = ($('#nTags').value.trim() ? $('#nTags').value.split(',').map(t=>t.trim()).filter(Boolean) : []);
  const text = $('#nText').value.trim();

  if (!name){ alert('Enter athlete name.'); return; }
  if (!text){ alert('Write a short note.'); return; }

  (store[name] ||= []).push({ text, by, tags, at: Date.now() });
  write(LS_NOTES, store);

  $('#nStatus').textContent = `Posted to ${name}`;
  setTimeout(()=> $('#nStatus').textContent='Local mode. Online later.', 1200);
  $('#nText').value=''; // clear
  renderRecent(name);
}

function renderRecent(preferName){
  const list = $('#nList'); list.innerHTML = '';
  // Flatten last 12 across all athletes, newest first
  const all = [];
  for (const [name, arr] of Object.entries(store)){
    for (const n of arr){ all.push({ name, ...n }); }
  }
  all.sort((a,b)=>b.at-a.at);
  const rows = all.slice(0,12);

  if (!rows.length){ list.innerHTML = '<li class="muted">No notes yet.</li>'; return; }
  rows.forEach(n=>{
    const li = document.createElement('li');
    li.innerHTML = `
      <div class="timestamp">${new Date(n.at).toLocaleString()}</div>
      <div><strong>${n.name}</strong> — “${n.text}”</div>
      <div class="muted">— ${n.by}${n.tags?.length ? ' • '+ n.tags.join(', ') : ''}</div>
    `;
    list.appendChild(li);
  });
}

document.addEventListener('DOMContentLoaded', ()=>{
  document.getElementById('postNote').addEventListener('click', post);
  renderRecent();
});
