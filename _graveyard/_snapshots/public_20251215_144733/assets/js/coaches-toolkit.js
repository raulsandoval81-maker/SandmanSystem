// public/assets/js/coaches-toolkit.js
// Requires: firebase-init.js exporting { db, serverTimestamp }
// Firestore structure:
//  - practice_plans (col)
//      doc: auto-id
//      { sport, program, dateISO, title, body, createdAt }
//  - coach_notes (col)
//      doc id: scope (e.g., 'global', 'wrestling', 'boxing'…)
//      { scope, body, updatedAt }

import { db } from './firebase-init.js';

const $ = (sel) => document.querySelector(sel);

// ---------- Practice Plans ----------
const ppSport   = $("#ppSport");
const ppProgram = $("#ppProgram");
const ppDate    = $("#ppDate");
const ppTitle   = $("#ppTitle");
const ppBody    = $("#ppBody");
const ppSaveBtn = $("#ppSaveBtn");
const ppNewBtn  = $("#ppNewBtn");
const ppStatus  = $("#ppStatus");
const ppList    = $("#ppList");

// fill today default
if (!ppDate.value) {
  const d = new Date();
  ppDate.value = d.toISOString().slice(0,10); // yyyy-mm-dd
}

ppSaveBtn.addEventListener("click", async () => {
  const sport   = ppSport.value;
  const program = ppProgram.value;
  const dateISO = ppDate.value;
  const title   = ppTitle.value.trim();
  const body    = ppBody.value.trim();

  if (!title || !body) {
    setPPStatus("Please add a title and plan body.", true);
    return;
  }

  try {
    const ref = await addDoc(collection(db, "practice_plans"), {
      sport, program, dateISO, title, body, createdAt: serverTimestamp()
    });
    setPPStatus(`Saved ✓ (id: ${ref.id})`);
    await loadRecentPlans(); // refresh list
  } catch (err) {
    console.error(err);
    setPPStatus("Error saving plan.", true);
  }
});

ppNewBtn.addEventListener("click", () => {
  ppTitle.value = "";
  ppBody.value = "";
  setPPStatus("Cleared.");
});

function setPPStatus(msg, isErr=false){
  ppStatus.textContent = msg;
  ppStatus.classList.remove("ok","err","muted");
  ppStatus.classList.add(isErr ? "err" : "ok");
}

// Load last 6 plans (most recent)
async function loadRecentPlans(){
  ppList.innerHTML = `<div class="muted">Loading recent plans…</div>`;
  try {
    const q = query(collection(db,"practice_plans"), orderBy("createdAt","desc"), limit(6));
    const snap = await getDocs(q);
    if (snap.empty) {
      ppList.innerHTML = `<div class="muted">No plans yet.</div>`;
      return;
    }
    const items = [];
    snap.forEach(docSnap => {
      const p = docSnap.data();
      const when = p.dateISO || "—";
      items.push(`
        <div class="list-item">
          <span><strong>${p.title}</strong> · ${p.sport} / ${p.program} · ${when}</span>
          <div class="row">
            <button class="btn btn-ghost" data-load="${docSnap.id}">Load</button>
          </div>
        </div>
      `);
    });
    ppList.innerHTML = items.join("");

    // wire "Load" buttons to bring content back into editor
    ppList.querySelectorAll("[data-load]").forEach(btn=>{
      btn.addEventListener("click", async () => {
        const id = btn.getAttribute("data-load");
        try{
          const dref = doc(db,"practice_plans", id);
          const dsnap = await getDoc(dref);
          if (dsnap.exists()){
            const p = dsnap.data();
            ppSport.value = p.sport || "wrestling";
            ppProgram.value = p.program || "youth";
            ppDate.value = p.dateISO || new Date().toISOString().slice(0,10);
            ppTitle.value = p.title || "";
            ppBody.value = p.body || "";
            setPPStatus(`Loaded plan "${p.title}"`);
          }
        }catch(err){
          console.error(err);
          setPPStatus("Could not load plan.", true);
        }
      });
    });

  } catch(err){
    console.error(err);
    ppList.innerHTML = `<div class="muted">Failed to load plans.</div>`;
  }
}

// ---------- Coach Notes ----------
const cnScope   = $("#cnScope");
const cnBody    = $("#cnBody");
const cnSaveBtn = $("#cnSaveBtn");
const cnClearBtn= $("#cnClearBtn");
const cnStatus  = $("#cnStatus");

cnSaveBtn.addEventListener("click", async () => {
  const scope = cnScope.value;
  const body = cnBody.value.trim();

  try {
    await setDoc(doc(db,"coach_notes", scope), {
      scope, body, updatedAt: serverTimestamp()
    });
    setCNStatus("Notes saved ✓");
  } catch(err){
    console.error(err);
    setCNStatus("Error saving notes.", true);
  }
});

cnClearBtn.addEventListener("click", () => {
  cnBody.value = "";
  setCNStatus("Cleared.");
});

cnScope.addEventListener("change", loadNotesForScope);

function setCNStatus(msg, isErr=false){
  cnStatus.textContent = msg;
  cnStatus.classList.remove("ok","err","muted");
  cnStatus.classList.add(isErr ? "err" : "ok");
}

async function loadNotesForScope(){
  const scope = cnScope.value;
  setCNStatus("Loading…");
  try{
    const dref = doc(db,"coach_notes", scope);
    const dsnap = await getDoc(dref);
    cnBody.value = dsnap.exists() ? (dsnap.data().body || "") : "";
    setCNStatus("Ready.");
  }catch(err){
    console.error(err);
    setCNStatus("Failed to load notes.", true);
  }
}

// ---------- Boot ----------
console.log("[Coach • Toolkit] JS loaded");
await loadRecentPlans();
await loadNotesForScope();
