// parent-reactions.js — quick reacts + comment w/ throttle (localStorage)
// Data shape: { athleteId: [{type, note?, who, ts}], ... }

const LS_FEED = "sm_parent_feedback_v1";
const DAILY_CAP = 12;         // per device/day
const COMMENT_MAX = 280;

function load(){ try{ return JSON.parse(localStorage.getItem(LS_FEED))||{} }catch{return{}} }
function save(v){ localStorage.setItem(LS_FEED, JSON.stringify(v)) }
function todayKey(){ const d=new Date(); return `${d.getFullYear()}-${d.getMonth()+1}-${d.getDate()}`; }

function canPost(){ // simple per-day limiter
  const key = "sm_parent_cap_"+todayKey();
  const n = Number(localStorage.getItem(key)||0);
  if(n>=DAILY_CAP) return false;
  localStorage.setItem(key, String(n+1));
  return true;
}

export function initParentReactions({ rootId, athleteId, parentName="Parent" }){
  const root = document.getElementById(rootId);
  if(!root || !athleteId) return;

  root.innerHTML = `
    <div class="prx">
      <div class="prx__row">
        <button data-react="clap">👏</button>
        <button data-react="heart">❤️</button>
        <button data-react="celebrate">🎉</button>
        <button data-react="thumbsup">👍</button>
        <button data-react="thumbsdown">👎</button>
        <button data-react="muscle">💪</button>
      </div>
      <div class="prx__row">
        <input id="prxNote" maxlength="${COMMENT_MAX}" placeholder="Leave a short note (optional)"/>
        <button id="prxSend">Send</button>
      </div>
      <p class="prx__cap" id="prxCap"></p>
      <ul class="prx__feed" id="prxFeed" aria-live="polite"></ul>
    </div>
  `;

  const feedEl = root.querySelector("#prxFeed");
  const capEl  = root.querySelector("#prxCap");
  const noteEl = root.querySelector("#prxNote");

  function pushItem(type, note){
    if(!canPost()){ capEl.textContent = "Daily limit reached (come back tomorrow)."; return; }
    const db = load(); db[athleteId] = db[athleteId]||[];
    db[athleteId].unshift({ type, note: (note||"").trim(), who: parentName, ts: Date.now() });
    db[athleteId] = db[athleteId].slice(0, 50);
    save(db); render();
  }

  function render(){
    const db = load(); const list = db[athleteId]||[];
    capEl.textContent = `Recent from you • showing ${Math.min(list.length,10)} of ${list.length}`;
    feedEl.innerHTML = list.slice(0,10).map(i=>{
      const t = new Date(i.ts).toLocaleString();
      const txt = i.note ? ` — <span class="note">${escapeHtml(i.note)}</span>`:"";
      const emoji = emojiFor(i.type);
      return `<li>${emoji} <strong>${i.who}</strong> • <span class="muted">${t}</span>${txt}</li>`;
    }).join("");
  }

  root.querySelectorAll("[data-react]").forEach(btn=>{
    btn.addEventListener("click", ()=>pushItem(btn.dataset.react, ""));
  });
  root.querySelector("#prxSend").addEventListener("click", ()=>{
    const val = (noteEl.value||"").trim();
    if(!val) return;
    pushItem("note", val);
    noteEl.value="";
  });

  render();
}

function emojiFor(t){
  return ({clap:"👏",heart:"❤️",celebrate:"🎉",thumbsup:"👍",thumbsdown:"👎",muscle:"💪",note:"💬"})[t]||"✨";
}
function escapeHtml(s){ return s.replace(/[&<>"']/g,m=>({ "&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[m])) }
