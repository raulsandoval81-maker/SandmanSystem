// Sandman Timer Engine — Clean / Timers Only / Safe Mode
// Categories: Warm-Up, Drills, Technique, Live, Conditioning, Flat Timers, Practice Layout (60)
// No notes, no links, no random cues.

///////////////////////
// PACKS (presets)
///////////////////////
const PACKS = {
  "Warm-Up Timers": {
    presets: [
      { id:"wu_shadow_ss", name:"Shadow — slow/slow (90s)", type:"simple", duration:90,
        commands:{ start:"Slow feet, slow shots", short:"Short time!", end:"Time!" } },
      { id:"wu_shadow_sf", name:"Shadow — slow/fast (90s)", type:"simple", duration:90,
        commands:{ start:"Slow feet, fast shots", short:"Short time!", end:"Time!" } },
      { id:"wu_shadow_fs", name:"Shadow — fast/slow (90s)", type:"simple", duration:90,
        commands:{ start:"Fast feet, slow shots", short:"Short time!", end:"Time!" } },
      { id:"wu_shadow_ff", name:"Shadow — fast/fast (90s)", type:"simple", duration:90,
        commands:{ start:"Fast feet, fast shots", short:"Short time!", end:"Time!" } },
      { id:"wu_emom_mob",  name:"Mobility Flow — EMOM 5:00", type:"interval", duration:300, interval:60,
        commands:{ start:"Mobility flow — five minutes", every:["Switch"], short:"Short time!", end:"Time!" } }
    ]
  },

  "Drill Timers (Old Moves)": {
    presets: [
      { id:"dr_easy_no",  name:"Easy in, no finish (90s)", type:"simple", duration:90,
        commands:{ start:"Easy in, no finish", short:"Short time!", end:"Time!" } },
      { id:"dr_easy_easy",name:"Easy in, easy finish (90s)", type:"simple", duration:90,
        commands:{ start:"Easy in, easy finish", short:"Short time!", end:"Time!" } },
      { id:"dr_easy_hard",name:"Easy in, hard finish (90s)", type:"simple", duration:90,
        commands:{ start:"Easy in, hard finish", short:"Short time!", end:"Time!" } },
      { id:"dr_hard_easy",name:"Hard in, easy finish (90s)", type:"simple", duration:90,
        commands:{ start:"Hard in, easy finish", short:"Short time!", end:"Time!" } },
      { id:"dr_hard_hard",name:"Hard in, hard finish (90s)", type:"simple", duration:90,
        commands:{ start:"Hard in, hard finish", short:"Short time!", end:"Time!" } }
    ]
  },

  "Technique Timers (New Moves)": {
    presets: [
      { id:"tech_teach_3", name:"Teach Block — 3:00", type:"simple", duration:180,
        commands:{ start:"Eyes on coach", short:"Short time!", end:"Time!" } },
      { id:"tech_partner_2", name:"Partners Drill — 2:00", type:"simple", duration:120,
        commands:{ start:"Reps, smooth pace", short:"Short time!", end:"Time!" } },
      { id:"tech_review_1", name:"Mini-Review — 1:00", type:"simple", duration:60,
        commands:{ start:"Hit the sequence", short:"Short time!", end:"Time!" } },
      { id:"tech_demo_30",  name:"Coach Demo — 0:30", type:"simple", duration:30,
        commands:{ start:"Eyes up", end:"Time!" } },
      { id:"tech_fix_2",    name:"Q&A / Fixes — 2:00", type:"simple", duration:120,
        commands:{ start:"Ask, fix, lock it in", short:"Short time!", end:"Time!" } }
    ]
  },

  "Live Timers (Situations)": {
    presets: [
      // Beginner (15–20s)
      { id:"lv_beg_neu_15x8", name:"Beginner — Neutral 15s × 8 (2:00)", type:"interval", duration:120, interval:15,
        commands:{ start:"Beginner neutral — fifteen second bursts", short:"Short time!", end:"Time!" } },
      { id:"lv_beg_bot_20x6", name:"Beginner — Bottom 20s × 6 (2:00)", type:"interval", duration:120, interval:20,
        commands:{ start:"Bottom starts — twenty seconds", short:"Short time!", end:"Time!" } },

      // Intermediate (15–45s)
      { id:"lv_int_hf_30x6", name:"Intermediate — Hand-Fight 30s × 6 (3:00)", type:"interval", duration:180, interval:30,
        commands:{ start:"Neutral hand fight — thirty on", short:"Short time!", end:"Time!" } },
      { id:"lv_int_top_45x4", name:"Intermediate — Top Ride 45s × 4 (3:00)", type:"interval", duration:180, interval:45,
        commands:{ start:"Top ride — hold position", short:"Short time!", end:"Time!" } },

      // Advanced (15–60s)
      { id:"lv_adv_chain_60x3", name:"Advanced — Chain 60s × 3 (3:00)", type:"interval", duration:180, interval:60,
        commands:{ start:"Advanced chain — one minute goes", short:"Short time!", end:"Time!" } }
    ]
  },

  "Conditioning Timers": {
    presets: [
      { id:"cond_tabata_20_10", name:"Tabata — 20/10 × 8 (4:00)", type:"tabata", work:20, rest:10, rounds:8,
        commands:{ start:"Tabata — twenty on, ten off", work:"Work!", rest:"Rest!", short:"Ten seconds!", end:"Time!" } },
      { id:"cond_hiit_30_30x8", name:"HIIT — 30/30 × 8 (8:00)", type:"intervalPair", work:30, rest:30, rounds:8,
        commands:{ start:"Thirty on, thirty off — eight rounds", work:"Work!", rest:"Rest!", short:"Short time!", end:"Time!" } },
      { id:"cond_hiit_40_20x8", name:"HIIT — 40/20 × 8 (8:00)", type:"intervalPair", work:40, rest:20, rounds:8,
        commands:{ start:"Forty on, twenty off — eight rounds", work:"Work!", rest:"Rest!", short:"Short time!", end:"Time!" } },
      { id:"cond_hiit_50_10x8", name:"HIIT — 50/10 × 8 (8:00)", type:"intervalPair", work:50, rest:10, rounds:8,
        commands:{ start:"Fifty on, ten off — eight rounds", work:"Work!", rest:"Rest!", short:"Short time!", end:"Time!" } },
      { id:"cond_emom_5", name:"EMOM — 5:00 (whistle each minute)", type:"interval", duration:300, interval:60,
        commands:{ start:"Every minute on the minute — five rounds", every:["Switch"], short:"Short time!", end:"Time!" } }
    ]
  },

  "Flat Timers": {
    presets: [
      { id:"flat_30", name:"Plain 0:30", type:"simple", duration:30,  commands:{ start:"Wrestle!", short:"Short time!", end:"Time!" } },
      { id:"flat_60", name:"Plain 1:00", type:"simple", duration:60,  commands:{ start:"Wrestle!", short:"Short time!", end:"Time!" } },
      { id:"flat_90", name:"Plain 1:30", type:"simple", duration:90,  commands:{ start:"Wrestle!", short:"Short time!", end:"Time!" } },
      { id:"flat_120",name:"Plain 2:00", type:"simple", duration:120, commands:{ start:"Wrestle!", short:"Short time!", end:"Time!" } },
      { id:"flat_300",name:"Plain 5:00", type:"simple", duration:300, commands:{ start:"Wrestle!", short:"Short time!", end:"Time!" } }
    ]
  },

  "Practice Layout (60 only)": {
    presets: [
      { id:"layout_60_std", name:"60-Min Practice (5/10/15/15/10/5)", type:"playlist", playlist: [
        { label:"On-Mat Talk",    duration:  5*60 },
        { label:"Warm-Up",        duration: 10*60 },
        { label:"Old Moves",      duration: 15*60 },
        { label:"New Technique",  duration: 15*60 },
        { label:"Live Session", duration: 10*60 },
        { label:"Conditioning",   duration:  5*60 }
      ]}
    ]
  }
};

///////////////////////
// ELEMENTS
///////////////////////
const conceptEl = document.getElementById('concept');
const presetEl  = document.getElementById('preset');
const promptsEl = document.getElementById('prompts');
const clockEl   = document.getElementById('clock');
const statusEl  = document.getElementById('status');
const pillWrap  = document.getElementById('intervalPill');
const pillClock = document.getElementById('intervalClock');
const startBtn  = document.getElementById('startBtn');
const pauseBtn  = document.getElementById('pauseBtn');
const resetBtn  = document.getElementById('resetBtn');
const roundsEl  = document.getElementById('roundsInput');
const restEl    = document.getElementById('restInput');
const logEl     = document.getElementById('log');

// Settings
const settings  = document.getElementById('settings');
const gearBtn   = document.getElementById('gearBtn');
const closeSettings = document.getElementById('closeSettings');
const colorMode = document.getElementById('colorMode');
const audioMode = document.getElementById('audioMode');
const countdownMode = document.getElementById('countdownMode');
const voiceEl   = document.getElementById('voiceToggle');
const volumeEl  = document.getElementById('volume');
const defaultsBtn = document.getElementById('defaultsBtn');
const stageToggle = document.getElementById('stageToggle');

///////////////////////
// STATE
///////////////////////
let S = {
  running:false,
  kind:null,          // simple | interval | tabata | intervalPair | playlist
  tLeft:0,
  intLeft:0,
  round:1,
  rounds:1,
  restBetween:0,
  phase:'work',
  raf:null,
  lastTick:0,
  prompts:[],
  pIdx:0,
  playlist:[],
  trackIdx:0,
  presetData:null
};

///////////////////////
// HELPERS
///////////////////////
function fmt(sec){ sec=Math.max(0,Math.ceil(sec)); const m=Math.floor(sec/60), s=sec%60; return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`; }
function setStatus(txt){ statusEl.textContent = txt; }
function log(line){ const ts=new Date().toLocaleTimeString(); logEl.textContent += `[${ts}] ${line}\n`; logEl.scrollTop = logEl.scrollHeight; }
function setBodyColor(mode){ if(!colorMode.checked){ document.body.className=''; return; } document.body.className = mode; }

// Audio
let audioCtx;
function tone(ms=150, freq=1200, vol=Number(volumeEl.value||0.9)){
  try{
    audioCtx = audioCtx || new (window.AudioContext||window.webkitAudioContext)();
    const o = audioCtx.createOscillator(), g = audioCtx.createGain();
    o.connect(g); g.connect(audioCtx.destination);
    o.type='sine'; o.frequency.value=freq;
    const t = audioCtx.currentTime;
    g.gain.setValueAtTime(0.0001,t);
    g.gain.linearRampToValueAtTime(vol,t+0.02);
    g.gain.exponentialRampToValueAtTime(0.0001,t+ms/1000);
    o.start(t); o.stop(t+ms/1000);
  }catch(e){}
}
function whistle(){
  if(audioMode.value==='none' || audioMode.value==='voice') return;
  if(audioMode.value==='whistle' || audioMode.value==='voiceWhistle'){ tone(220,1400); }
}
function bellStart(){ if(audioMode.value!=='bell') return; tone(220,660); setTimeout(()=>tone(180,880),230); }
function bellEnd(){ if(audioMode.value!=='bell') return; tone(240,660); setTimeout(()=>tone(240,660),260); }
function speak(msg){
  if(voiceEl.value!=='on') return;
  if(audioMode.value==='none' || audioMode.value==='whistle' || audioMode.value==='bell'){
    if(audioMode.value!=='voice' && audioMode.value!=='voiceWhistle') return;
  }
  if(!msg) return;
  const u = new SpeechSynthesisUtterance(msg);
  u.rate=1.05; u.pitch=1; u.volume=Number(volumeEl.value||0.9);
  speechSynthesis.cancel(); speechSynthesis.speak(u);
}
function say(msg){ speak(msg); }
function cue(kind){
  const c = S.presetData?.commands || null; if(!c) return;
  if(kind==='every'){
    const arr = Array.isArray(c.every)?c.every:[];
    if(arr.length){ say(arr[S.pIdx % arr.length]); S.pIdx++; }
  } else if(kind==='work'){ say(c.work || "Work"); }
  else if(kind==='rest'){ say(c.rest || "Rest"); }
  else { say(c[kind]); }
}
function nextPrompt(){
  if(!S.prompts.length) return;
  const text = S.prompts[S.pIdx % S.prompts.length]; S.pIdx++; say(text); log(`Prompt: ${text}`);
}

///////////////////////
// UI POPULATE
///////////////////////
function loadConcepts(){
  conceptEl.innerHTML='';
  Object.keys(PACKS).forEach(k=>{
    const opt=document.createElement('option'); opt.value=k; opt.textContent=k; conceptEl.appendChild(opt);
  });
}
function loadPresets(){
  const fam = conceptEl.value; presetEl.innerHTML='';
  PACKS[fam].presets.forEach(p=>{
    const opt=document.createElement('option'); opt.value=p.id; opt.textContent=p.name; presetEl.appendChild(opt);
  });
}
loadConcepts(); loadPresets();
conceptEl.addEventListener('change', loadPresets);

///////////////////////
// ENGINE
///////////////////////
function loadSelection(){
  const fam = conceptEl.value, pid = presetEl.value;
  const preset = PACKS[fam].presets.find(p=>p.id===pid);
  S.kind = preset.type; S.presetData = preset;
  S.prompts = (promptsEl.value||'').split(',').map(s=>s.trim()).filter(Boolean);
  S.pIdx=0; S.rounds=+roundsEl.value||1; S.restBetween=+restEl.value||0; S.round=1;

  if(preset.type==='simple'){ S.tLeft=preset.duration; pillWrap.style.display='none'; }
  else if(preset.type==='interval'){ S.tLeft=preset.duration; S.intLeft=preset.interval; pillWrap.style.display='inline-block'; pillClock.textContent=fmt(S.intLeft); }
  else if(preset.type==='tabata'){ S.phase='work'; S.tLeft=preset.work; S.round=1; S.rounds=preset.rounds; pillWrap.style.display='inline-block'; pillClock.textContent='WORK'; }
  else if(preset.type==='intervalPair'){ S.phase='work'; S.tLeft=preset.work; S.round=1; S.rounds=preset.rounds; pillWrap.style.display='inline-block'; pillClock.textContent='WORK'; }
  else if(preset.type==='playlist'){ S.playlist=preset.playlist.map(t=>({label:t.label,duration:t.duration})); S.trackIdx=0; S.tLeft=S.playlist[0].duration; pillWrap.style.display='none'; log(`Layout loaded: ${preset.name}`); }

  clockEl.textContent = fmt(S.tLeft);
}
presetEl.addEventListener('change', loadSelection);

function tick(){
  if(!S.running) return;
  S.raf = requestAnimationFrame(tick);
  const now = performance.now(), dt = (now - S.lastTick)/1000; S.lastTick = now;

  if(S.kind==='simple'){
    setBodyColor('go'); S.tLeft -= dt;
    if(Math.ceil(S.tLeft)===10 && countdownMode.value!=='none'){ setBodyColor('short'); cue('short'); if(audioMode.value==='bell') tone(120,880); }
    if(S.tLeft<=0){ setBodyColor('stop'); if(audioMode.value==='bell') bellEnd(); else whistle(); cue('end'); log('Finished'); stop(); return; }
    clockEl.textContent = fmt(S.tLeft);
  }

  else if(S.kind==='interval'){
    setBodyColor('go'); S.tLeft -= dt; S.intLeft -= dt;
    if(Math.ceil(S.tLeft)===10 && countdownMode.value!=='none'){ setBodyColor('short'); cue('short'); if(audioMode.value==='bell') tone(120,880); }
    if(S.intLeft<=0){
      if(audioMode.value==='bell') bellStart(); else whistle();
      cue('every'); nextPrompt();
      S.intLeft += S.presetData.interval;
    }
    if(S.tLeft<=0){
      if(S.round < S.rounds){
        S.round++;
        if(S.restBetween>0){
          log(`Round ${S.round-1} done. Rest ${S.restBetween}s`);
          setStatus('rest'); setBodyColor('stop'); S.running=false;
          let r=S.restBetween; const restTimer=setInterval(()=>{
            r--; pillClock.textContent='REST '+fmt(r); clockEl.textContent='REST '+fmt(r);
            if(r<=0){ clearInterval(restTimer); S.running=true; setStatus('running'); setBodyColor('go'); S.tLeft=S.presetData.duration; S.intLeft=S.presetData.interval; S.lastTick=performance.now(); tick(); }
          },1000);
          return;
        } else {
          log(`Round ${S.round-1} done → starting ${S.round}`); setBodyColor('go'); S.tLeft=S.presetData.duration; S.intLeft=S.presetData.interval;
        }
      } else {
        setBodyColor('stop'); if(audioMode.value==='bell') bellEnd(); else whistle(); cue('end'); log('Finished'); stop(); return;
      }
    }
    clockEl.textContent = fmt(S.tLeft); pillClock.textContent = fmt(S.intLeft);
  }

  else if(S.kind==='tabata' || S.kind==='intervalPair'){
    S.tLeft -= dt;
    if(S.phase==='work'){ setBodyColor('go'); if(Math.ceil(S.tLeft)===10 && countdownMode.value!=='none'){ setBodyColor('short'); cue('short'); if(audioMode.value==='bell') tone(120,880); } }
    else { setBodyColor('stop'); }
    if(S.tLeft<=0){
      if(S.phase==='work'){
        if(audioMode.value==='bell') bellEnd(); else whistle();
        cue('rest'); S.phase='rest'; S.tLeft=S.presetData.rest; pillClock.textContent='REST';
      } else {
        S.round++;
        if(S.round > S.rounds){ setBodyColor('stop'); if(audioMode.value==='bell') bellEnd(); else whistle(); cue('end'); log('Finished'); stop(); return; }
        if(audioMode.value==='bell') bellStart(); else whistle(); cue('work'); S.phase='work'; S.tLeft=S.presetData.work; pillClock.textContent='WORK';
      }
    }
    clockEl.textContent = (S.phase==='work'?'W ':'R ') + fmt(S.tLeft) + `  [${S.round}/${S.rounds}]`;
  }

  else if(S.kind==='playlist'){
    setBodyColor('go'); S.tLeft -= dt;
    if(Math.ceil(S.tLeft)===10 && countdownMode.value!=='none'){ setBodyColor('short'); cue('short'); if(audioMode.value==='bell') tone(120,880); }
    if(S.tLeft<=0){
      if(audioMode.value==='bell') bellEnd(); else whistle(); setBodyColor('stop');
      S.trackIdx++;
      if(S.trackIdx >= S.playlist.length){ cue('end'); log('Layout finished'); stop(); return; }
      const track = S.playlist[S.trackIdx]; log(`Next: ${track.label}`); say(track.label); setBodyColor('go'); S.tLeft=track.duration;
    }
    const track = S.playlist[S.trackIdx]; clockEl.textContent = fmt(S.tLeft); statusEl.textContent = `running • ${track.label}`;
  }
}

function start(){
  if(S.running) return;
  loadSelection(); S.running=true; S.lastTick=performance.now(); setStatus('running'); setBodyColor('go');

  if(countdownMode.value==='standard'){ ["5","4","3","2","1","Wrestle!"].forEach(say); }
  if(S.kind!=='playlist'){ if(audioMode.value==='bell') bellStart(); else whistle(); }
  else { const track=S.playlist[0]; say(track.label); }

  cue('start'); log(`Start: ${conceptEl.value} → ${presetEl.options[presetEl.selectedIndex].text}`);
  tick();
}
function pause(){ if(!S.running) return; S.running=false; cancelAnimationFrame(S.raf); setStatus('paused'); log('Paused'); }
function stop(){ S.running=false; cancelAnimationFrame(S.raf); setStatus('idle'); document.body.className=''; clockEl.textContent='00:00'; log('Stopped'); }

// Bind
startBtn.onclick=start; pauseBtn.onclick=pause; resetBtn.onclick=stop;

// Settings UI
gearBtn.onclick = ()=> settings.style.display = 'block';
closeSettings.onclick = ()=> settings.style.display = 'none';
defaultsBtn.onclick = ()=>{
  colorMode.checked = false;
  audioMode.value = 'voiceWhistle';
  countdownMode.value = 'standard';
  voiceEl.value = 'on';
  volumeEl.value = 0.9;
};

// Big clock toggle
if(stageToggle){
  stageToggle.onclick = ()=>{
    document.body.classList.toggle('stage');
    stageToggle.textContent = document.body.classList.contains('stage') ? 'Normal clock' : 'Big clock';
  };
}
const themeToggle = document.getElementById('themeToggle');
if(themeToggle){
  themeToggle.onclick = ()=>{
    document.body.classList.toggle('theme-team');
    themeToggle.textContent = document.body.classList.contains('theme-team') ? 'Default colors' : 'Team colors';
  };
}

// Init
(function init(){
  const key='STE_sel_clean_v1';
  // populate
  loadSelection();
  // restore selection
  const saved = JSON.parse(sessionStorage.getItem(key)||'{}');
  if(saved.concept && PACKS[saved.concept]) conceptEl.value = saved.concept;
  loadPresets();
  if(saved.preset){
    const found = PACKS[conceptEl.value].presets.find(p=>p.id===saved.preset);
    if(found) presetEl.value = saved.preset;
  }
  conceptEl.addEventListener('change', ()=>{ sessionStorage.setItem(key, JSON.stringify({concept:conceptEl.value,preset:presetEl.value})); loadSelection(); });
  presetEl.addEventListener('change', ()=>{ sessionStorage.setItem(key, JSON.stringify({concept:conceptEl.value,preset:presetEl.value})); loadSelection(); });
})();
