// public/assets/js/coaches-athlete.js

import {
  db, collection, doc, getDoc, getDocs, query, where, limit,
  addDoc, updateDoc, deleteDoc, serverTimestamp
} from './firebase-init.js';   // <-- correct relative path

console.log('[Coach Athlete] module loaded, db ok?', !!db);

// (example) ensure there is at least one log doc
async function ensureLogOnOpen(athleteId, coachUid){
  const entriesCol = collection(db, 'athletes', athleteId, 'logs');
  const snap = await getDocs(query(entriesCol, limit(1)));
  if (snap.empty){
    await addDoc(entriesCol, {
      type: 'system:init',
      note: 'Log initialized on first open',
      metrics: { focus: null, effort: null, attitude: null, respect: null, skills: [] },
      createdAt: serverTimestamp(),
      createdBy: coachUid || 'coach',
    });
  }
}

// Helpers
const $ = id => document.getElementById(id);
const setStatus = m => ($('status').textContent = m);

let athleteId = null;

document.addEventListener('DOMContentLoaded', init);

async function init(){
  // pull ?id= from URL (optional)
  const params = new URLSearchParams(location.search);
  athleteId = params.get('id') || 'demo-athlete';

  // wire UI
  $('addSkill').addEventListener('click', addSkillRow);
  $('saveLog').addEventListener('click', saveLog);
  $('clearLog').addEventListener('click', clearForm);
  $('reloadLogs').addEventListener('click', loadLogs);
  $('exportLogs').addEventListener('click', exportCsv);

  addSkillRow(); // starter row
  await ensureLogOnOpen(athleteId, 'coach:demo');
  await loadLogs();
  setStatus('Ready.');
}

function addSkillRow(){
  const wrap = $('skills');
  const row = document.createElement('div');
  row.style.margin = '6px 0';
  row.innerHTML = `<input placeholder="Skill name" />`;
  wrap.appendChild(row);
}

function clearForm(){
  ['focus','effort','attitude','respect'].forEach(id => $(id).value = 3);
  $('skills').innerHTML = '';
  $('coachNotes').value = '';
  addSkillRow();
}

async function saveLog(){
  try{
    const entry = {
      metrics: {
        focus: +$('focus').value,
        effort: +$('effort').value,
        attitude: +$('attitude').value,
        respect: +$('respect').value,
        skills: [...$('skills').querySelectorAll('input')].map(i => i.value).filter(Boolean),
      },
      note: $('coachNotes').value || null,
      createdAt: serverTimestamp(),
      createdBy: 'coach:demo',
    };
    await addDoc(collection(db,'athletes',athleteId,'logs'), entry);
    setStatus('Saved.');
    await loadLogs();
  }catch(err){
    console.error(err);
    setStatus('Save failed.');
  }
}

async function loadLogs(){
  const list = $('logList');
  list.textContent = 'Loading...';
  const snap = await getDocs(query(collection(db,'athletes',athleteId,'logs'), limit(25)));
  if (snap.empty){ list.textContent = 'No logs.'; return; }
  list.innerHTML = '';
  snap.forEach(docu => {
    const li = document.createElement('div');
    li.style.padding = '6px 0';
    li.textContent = JSON.stringify(docu.data());
    list.appendChild(li);
  });
}

function exportCsv(){
  setStatus('CSV export (placeholder).');
}
