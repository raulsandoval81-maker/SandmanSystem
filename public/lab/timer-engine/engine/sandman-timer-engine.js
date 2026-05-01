// ===== Sandman Timer — Engine (Integrated Trainer Version) =====

// Packs
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
      { id:"wu_emom_mob", name:"Mobility Flow — EMOM 5:00", type:"interval", duration:300, interval:60,
        commands:{ start:"Mobility flow — five minutes", every:["Switch"], short:"Short time!", end:"Time!" } }
    ]
  },

  "Drill Timers (Old Moves)": {
    presets: [
      { id:"dr_easy_no", name:"Easy in, no finish (90s)", type:"simple", duration:90,
        commands:{ start:"Easy in, no finish", short:"Short time!", end:"Time!" } },
      { id:"dr_easy_easy", name:"Easy in, easy finish (90s)", type:"simple", duration:90,
        commands:{ start:"Easy in, easy finish", short:"Short time!", end:"Time!" } },
      { id:"dr_easy_hard", name:"Easy in, hard finish (90s)", type:"simple", duration:90,
        commands:{ start:"Easy in, hard finish", short:"Short time!", end:"Time!" } },
      { id:"dr_hard_easy", name:"Hard in, easy finish (90s)", type:"simple", duration:90,
        commands:{ start:"Hard in, easy finish", short:"Short time!", end:"Time!" } },
      { id:"dr_hard_hard", name:"Hard in, hard finish (90s)", type:"simple", duration:90,
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
      { id:"tech_demo_30", name:"Coach Demo — 0:30", type:"simple", duration:30,
        commands:{ start:"Eyes up", end:"Time!" } },
      { id:"tech_fix_2", name:"Q&A / Fixes — 2:00", type:"simple", duration:120,
        commands:{ start:"Ask, fix, lock it in", short:"Short time!", end:"Time!" } }
    ]
  },

  "Live Timers (Situations)": {
    presets: [
      { id:"lv_beg_neu_15x8", name:"Beginner — Neutral 15s × 8 (2:00)", type:"interval", duration:120, interval:15,
        commands:{ start:"Beginner neutral — fifteen second bursts", short:"Short time!", end:"Time!" } },
      { id:"lv_beg_bot_20x6", name:"Beginner — Bottom 20s × 6 (2:00)", type:"interval", duration:120, interval:20,
        commands:{ start:"Bottom starts — twenty seconds", short:"Short time!", end:"Time!" } },
      { id:"lv_int_hf_30x6", name:"Intermediate — Hand-Fight 30s × 6 (3:00)", type:"interval", duration:180, interval:30,
        commands:{ start:"Neutral hand fight — thirty on", short:"Short time!", end:"Time!" } },
      { id:"lv_int_top_45x4", name:"Intermediate — Top Ride 45s × 4 (3:00)", type:"interval", duration:180, interval:45,
        commands:{ start:"Top ride — hold position", short:"Short time!", end:"Time!" } },
      { id:"lv_adv_chain_60x3", name:"Advanced — Chain 60s × 3 (3:00)", type:"interval", duration:180, interval:60,
        commands:{ start:"Advanced chain — one minute goes", short:"Short time!", end:"Time!" } }
    ]
  },

  "Fight Timers": {
    presets: [
      { id:"fight_45", name:"Fight Burst — 0:45", type:"interval", duration:45, interval:5,
        commands:{ start:"Fight burst", every:["Go"], short:"Short time!", end:"Time!" } },
      { id:"fight_60", name:"Fight Burst — 1:00", type:"interval", duration:60, interval:5,
        commands:{ start:"Fight burst", every:["Go"], short:"Short time!", end:"Time!" } },
      { id:"fight_90", name:"Fight Burst — 1:30", type:"interval", duration:90, interval:5,
        commands:{ start:"Fight burst", every:["Go"], short:"Short time!", end:"Time!" } },
      { id:"fight_180", name:"Fight Burst — 3:00", type:"interval", duration:180, interval:5,
        commands:{ start:"Fight burst", every:["Go"], short:"Short time!", end:"Time!" } },
      { id:"fight_300", name:"Fight Burst — 5:00", type:"interval", duration:300, interval:5,
        commands:{ start:"Fight burst", every:["Go"], short:"Short time!", end:"Time!" } }
    ]
  },

  "Solo Blocks": {
    presets: [
      { id:"solo_10", name:"Solo — 10:00", type:"simple", duration:600,
        commands:{ start:"Move", short:"Short time!", end:"Time!" } },
      { id:"solo_15", name:"Solo — 15:00", type:"simple", duration:900,
        commands:{ start:"Move", short:"Short time!", end:"Time!" } },
      { id:"solo_20", name:"Solo — 20:00", type:"simple", duration:1200,
        commands:{ start:"Move", short:"Short time!", end:"Time!" } }
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
      { id:"flat_30",  name:"Plain 0:30", type:"simple", duration:30, commands:{ start:"Wrestle!", short:"Short time!", end:"Time!" } },
      { id:"flat_45",  name:"Plain 0:45", type:"simple", duration:45, commands:{ start:"Wrestle!", short:"Short time!", end:"Time!" } },
      { id:"flat_60",  name:"Plain 1:00", type:"simple", duration:60, commands:{ start:"Wrestle!", short:"Short time!", end:"Time!" } },
      { id:"flat_90",  name:"Plain 1:30", type:"simple", duration:90, commands:{ start:"Wrestle!", short:"Short time!", end:"Time!" } },
      { id:"flat_120", name:"Plain 2:00", type:"simple", duration:120, commands:{ start:"Wrestle!", short:"Short time!", end:"Time!" } },
      { id:"flat_180", name:"Plain 3:00", type:"simple", duration:180, commands:{ start:"Wrestle!", short:"Short time!", end:"Time!" } },
      { id:"flat_300", name:"Plain 5:00", type:"simple", duration:300, commands:{ start:"Wrestle!", short:"Short time!", end:"Time!" } },
      { id:"flat_600", name:"Plain 10:00", type:"simple", duration:600, commands:{ start:"Wrestle!", short:"Short time!", end:"Time!" } }
    ]
  },

  "Practice Layout (60 only)": {
    presets: [
      { id:"layout_60_std", name:"60-Min Practice (5/10/15/15/10/5)", type:"playlist", playlist: [
        { label:"On-Mat Talk", duration:5*60 },
        { label:"Warm-Up", duration:10*60 },
        { label:"Old Moves", duration:15*60 },
        { label:"New Technique", duration:15*60 },
        { label:"Live Wrestling", duration:10*60 },
        { label:"Conditioning", duration:5*60 }
      ]}
    ]
  }
};

// ---- Elements
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

const trainerTrackEl = document.getElementById('trainerTrack');
const trainerTierEl = document.getElementById('trainerTier');
const trainerModeEl = document.getElementById('trainerMode');
const trainerSequenceEl = document.getElementById('trainerSequence');

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
const themeToggle = document.getElementById('themeToggle');

// ---- State
let S = {
  running:false, kind:null, tLeft:0, intLeft:0,
  round:1, rounds:1, restBetween:0, phase:'work',
  raf:null, lastTick:0, prompts:[], pIdx:0,
  playlist:[], trackIdx:0, presetData:null
};

const TRAINER_DEFAULTS = {
  youth: {
    t0: { concept:"Flat Timers", preset:"flat_45", mode:"shadow", sequence:"basic" },
    t1: { concept:"Flat Timers", preset:"flat_45", mode:"shadow", sequence:"basic" },
    t2: { concept:"Flat Timers", preset:"flat_60", mode:"shadow", sequence:"build" },
    t3: { concept:"Flat Timers", preset:"flat_60", mode:"shadow", sequence:"build" },
    t4: { concept:"Flat Timers", preset:"flat_90", mode:"shadow", sequence:"full" },
    t5: { concept:"Flat Timers", preset:"flat_90", mode:"shadow", sequence:"full" },
    t6: { concept:"Flat Timers", preset:"flat_180", mode:"shadow", sequence:"flow" },
    t7: { concept:"Flat Timers", preset:"flat_180", mode:"shadow", sequence:"flow" }
  },
  teen: {
    t0: { concept:"Flat Timers", preset:"flat_60", mode:"shadow", sequence:"build" },
    t1: { concept:"Flat Timers", preset:"flat_90", mode:"shadow", sequence:"full" },
    t2: { concept:"Flat Timers", preset:"flat_120", mode:"shadow", sequence:"flow" },
    t3: { concept:"Flat Timers", preset:"flat_180", mode:"shadow", sequence:"flow" },
    t4: { concept:"Flat Timers", preset:"flat_300", mode:"shadow", sequence:"flow" }
  }
};

const TRAINER_SCRIPTS = {
  youth: {
    t0: { shadow:"basic", fight:"burst", solo:"solo" },
    t1: { shadow:"basic", fight:"burst", solo:"solo" },
    t2: { shadow:"build", fight:"burst", solo:"solo" },
    t3: { shadow:"build", fight:"burst", solo:"solo" },
    t4: { shadow:"full", fight:"burst", solo:"solo" },
    t5: { shadow:"full", fight:"burst", solo:"solo" },
    t6: { shadow:"flow", fight:"burst", solo:"solo" },
    t7: { shadow:"flow", fight:"burst", solo:"solo" }
  },
  teen: {
    t0: { shadow:"build", fight:"burst", solo:"solo" },
    t1: { shadow:"full", fight:"burst", solo:"solo" },
    t2: { shadow:"flow", fight:"burst", solo:"solo" },
    t3: { shadow:"flow", fight:"burst", solo:"solo" },
    t4: { shadow:"flow", fight:"burst", solo:"solo" }
  }
};

// ---- Utils
function fmt(sec){
  sec = Math.max(0, Math.ceil(sec));
  const m = Math.floor(sec/60), s = sec%60;
  return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
}
function setStatus(txt){ statusEl.textContent = txt; }
function log(line){
  const ts=new Date().toLocaleTimeString();
  logEl.textContent += `[${ts}] ${line}\n`;
  logEl.scrollTop = logEl.scrollHeight;
}
function titleCase(v){
  if(!v) return '—';
  return v.replace(/[-_]/g,' ').replace(/\b\w/g, c => c.toUpperCase());
}
function setTrainerPanel(track='—', tier='—', mode='—', sequence='—'){
  trainerTrackEl.textContent = track === '—' ? track : titleCase(track);
  trainerTierEl.textContent = tier === '—' ? tier : tier.toUpperCase();
  trainerModeEl.textContent = mode === '—' ? mode : titleCase(mode);
  trainerSequenceEl.textContent = sequence === '—' ? sequence : titleCase(sequence);
}

// keep theme + stage, only toggle wash classes
function setBodyColor(mode){
  const body = document.body;
  body.classList.remove('go','short','stop');
  if (!colorMode.checked) return;
  if (mode) body.classList.add(mode);
}

// ---- Audio
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
  if(audioMode.value==='whistle' || audioMode.value==='voiceWhistle') tone(220,1400);
}
function bellStart(){
  if(audioMode.value!=='bell') return;
  tone(220,660);
  setTimeout(()=>tone(180,880),230);
}
function bellEnd(){
  if(audioMode.value!=='bell') return;
  tone(240,660);
  setTimeout(()=>tone(240,660),260);
}
function speak(msg){
  if(voiceEl.value!=='on') return;
  if(audioMode.value==='none' || audioMode.value==='whistle' || audioMode.value==='bell'){
    if(audioMode.value!=='voice' && audioMode.value!=='voiceWhistle') return;
  }
  if(!msg) return;
  const u = new SpeechSynthesisUtterance(msg);
  u.rate=1.05; u.pitch=1; u.volume=Number(volumeEl.value||0.9);
  speechSynthesis.cancel();
  speechSynthesis.speak(u);
}
function say(msg){ speak(msg); }
function cue(kind){
  const c = S.presetData?.commands || null;
  if(!c) return;
  if(kind==='every'){
    const arr = Array.isArray(c.every) ? c.every : [];
    if(arr.length){ say(arr[S.pIdx % arr.length]); S.pIdx++; }
  } else if(kind==='work'){
    say(c.work || "Work");
  } else if(kind==='rest'){
    say(c.rest || "Rest");
  } else {
    say(c[kind]);
  }
}
function nextPrompt(){
  if(!S.prompts.length) return;
  const text = S.prompts[S.pIdx % S.prompts.length];
  S.pIdx++;
  say(text);
  log(`Prompt: ${text}`);
}

// ---- UI populate
function loadConcepts(){
  conceptEl.innerHTML='';
  Object.keys(PACKS).forEach(k=>{
    const opt=document.createElement('option');
    opt.value=k;
    opt.textContent=k;
    conceptEl.appendChild(opt);
  });
}
function loadPresets(){
  const fam = conceptEl.value;
  presetEl.innerHTML='';
  PACKS[fam].presets.forEach(p=>{
    const opt=document.createElement('option');
    opt.value=p.id;
    opt.textContent=p.name;
    presetEl.appendChild(opt);
  });
}
loadConcepts();
loadPresets();
conceptEl.addEventListener('change', loadPresets);

// ---- Pre-round countdown
function preRoll(sec = 5) {
  return new Promise(resolve => {
    setStatus('ready');
    setBodyColor('stop');
    let t = sec;
    clockEl.textContent = `START ${fmt(t)}`;
    if (countdownMode.value !== 'none') say(String(t));
    const id = setInterval(() => {
      t--;
      clockEl.textContent = `START ${fmt(t)}`;
      if (t > 0 && countdownMode.value !== 'none') say(String(t));
      if (t <= 0) {
        clearInterval(id);
        if (audioMode.value === 'bell') bellStart(); else whistle();
        resolve();
      }
    }, 1000);
  });
}

// ---- Selection
function loadSelection(){
  const fam = conceptEl.value;
  const pid = presetEl.value;
  const preset = PACKS[fam].presets.find(p => p.id === pid);
  if(!preset) return;

  S.kind = preset.type;
  S.presetData = preset;
  S.prompts = (promptsEl.value || '').split(',').map(s => s.trim()).filter(Boolean);
  S.pIdx = 0;
  S.rounds = +roundsEl.value || 1;
  S.restBetween = +restEl.value || 0;
  S.round = 1;

  if(preset.type==='simple'){
    S.tLeft = preset.duration;
    pillWrap.style.display = 'none';
  } else if(preset.type==='interval'){
    S.tLeft = preset.duration;
    S.intLeft = preset.interval;
    pillWrap.style.display = 'inline-block';
    pillClock.textContent = fmt(S.intLeft);
  } else if(preset.type==='tabata'){
    S.phase='work';
    S.tLeft=preset.work;
    S.round=1;
    S.rounds=preset.rounds;
    pillWrap.style.display='inline-block';
    pillClock.textContent='WORK';
  } else if(preset.type==='intervalPair'){
    S.phase='work';
    S.tLeft=preset.work;
    S.round=1;
    S.rounds=preset.rounds;
    pillWrap.style.display='inline-block';
    pillClock.textContent='WORK';
  } else if(preset.type==='playlist'){
    S.playlist=preset.playlist.map(t=>({label:t.label,duration:t.duration}));
    S.trackIdx=0;
    S.tLeft=S.playlist[0].duration;
    pillWrap.style.display='none';
    log(`Layout loaded: ${preset.name}`);
  }

  clockEl.textContent = fmt(S.tLeft);
}
presetEl.addEventListener('change', loadSelection);

// ---- Engine
function tick(){
  if(!S.running) return;
  S.raf = requestAnimationFrame(tick);
  const now = performance.now(), dt = (now - S.lastTick)/1000;
  S.lastTick = now;

  if(S.kind==='simple'){
    setBodyColor('go');
    S.tLeft -= dt;
    if(Math.ceil(S.tLeft)===10 && countdownMode.value!=='none'){
      setBodyColor('short');
      cue('short');
      if(audioMode.value==='bell') tone(120,880);
    }
    if(S.tLeft<=0){
      setBodyColor('stop');
      if(audioMode.value==='bell') bellEnd(); else whistle();
      cue('end');
      log('Finished');
      stop();
      return;
    }
    clockEl.textContent = fmt(S.tLeft);
  }

  else if(S.kind==='interval'){
    setBodyColor('go');
    S.tLeft -= dt;
    S.intLeft -= dt;
    if(Math.ceil(S.tLeft)===10 && countdownMode.value!=='none'){
      setBodyColor('short');
      cue('short');
      if(audioMode.value==='bell') tone(120,880);
    }
    if(S.intLeft<=0){
      if(audioMode.value==='bell') bellStart(); else whistle();
      cue('every');
      nextPrompt();
      S.intLeft += S.presetData.interval;
    }
    if(S.tLeft<=0){
      if(S.round < S.rounds){
        S.round++;
        if(S.restBetween>0){
          log(`Round ${S.round-1} done. Rest ${S.restBetween}s`);
          setStatus('rest');
          setBodyColor('stop');
          S.running=false;
          let r=S.restBetween;
          const restTimer=setInterval(async ()=>{
            r--;
            pillClock.textContent='REST '+fmt(r);
            clockEl.textContent='REST '+fmt(r);
            if(r<=0){
              clearInterval(restTimer);
              await preRoll(5);
              S.running=true;
              setStatus('running');
              setBodyColor('go');
              S.tLeft=S.presetData.duration;
              S.intLeft=S.presetData.interval;
              S.lastTick=performance.now();
              tick();
            }
          },1000);
          return;
        } else {
          (async ()=>{
            S.running=false;
            await preRoll(5);
            S.running=true;
            setStatus('running');
            setBodyColor('go');
            S.tLeft=S.presetData.duration;
            S.intLeft=S.presetData.interval;
            S.lastTick=performance.now();
            tick();
          })();
          return;
        }
      } else {
        setBodyColor('stop');
        if(audioMode.value==='bell') bellEnd(); else whistle();
        cue('end');
        log('Finished');
        stop();
        return;
      }
    }
    clockEl.textContent = fmt(S.tLeft);
    pillClock.textContent = fmt(S.intLeft);
  }

  else if(S.kind==='tabata' || S.kind==='intervalPair'){
    S.tLeft -= dt;
    if(S.phase==='work'){
      setBodyColor('go');
      if(Math.ceil(S.tLeft)===10 && countdownMode.value!=='none'){
        setBodyColor('short');
        cue('short');
        if(audioMode.value==='bell') tone(120,880);
      }
    } else {
      setBodyColor('stop');
    }
    if(S.tLeft<=0){
      if(S.phase==='work'){
        if(audioMode.value==='bell') bellEnd(); else whistle();
        cue('rest');
        S.phase='rest';
        S.tLeft=S.presetData.rest;
        pillClock.textContent='REST';
      } else {
        S.round++;
        if(S.round > S.rounds){
          setBodyColor('stop');
          if(audioMode.value==='bell') bellEnd(); else whistle();
          cue('end');
          log('Finished');
          stop();
          return;
        }
        if(audioMode.value==='bell') bellStart(); else whistle();
        cue('work');
        S.phase='work';
        S.tLeft=S.presetData.work;
        pillClock.textContent='WORK';
      }
    }
    clockEl.textContent = (S.phase==='work'?'W ':'R ') + fmt(S.tLeft) + `  [${S.round}/${S.rounds}]`;
  }

  else if(S.kind==='playlist'){
    setBodyColor('go');
    S.tLeft -= dt;
    if(Math.ceil(S.tLeft)===10 && countdownMode.value!=='none'){
      setBodyColor('short');
      cue('short');
      if(audioMode.value==='bell') tone(120,880);
    }
    if(S.tLeft<=0){
      if(audioMode.value==='bell') bellEnd(); else whistle();
      setBodyColor('stop');
      S.trackIdx++;
      if(S.trackIdx >= S.playlist.length){
        cue('end');
        log('Layout finished');
        stop();
        return;
      }
      const track = S.playlist[S.trackIdx];
      log(`Next: ${track.label}`);
      say(track.label);
      setBodyColor('go');
      S.tLeft=track.duration;
    }
    const track = S.playlist[S.trackIdx];
    clockEl.textContent = fmt(S.tLeft);
    statusEl.textContent = `running • ${track.label}`;
  }
}

// ---- Controls
async function start(){
  if (S.running) return;
  loadSelection();
  await preRoll(5);
  S.running = true;
  S.lastTick = performance.now();
  setStatus('running');
  setBodyColor('go');
  if (S.kind === 'playlist') {
    const track = S.playlist[0];
    say(track.label);
  }
  cue('start');
  log(`Start: ${conceptEl.value} → ${presetEl.options[presetEl.selectedIndex].text}`);
  tick();
}
function pause(){
  if(!S.running) return;
  S.running=false;
  cancelAnimationFrame(S.raf);
  setStatus('paused');
  log('Paused');
}
function stop(){
  S.running=false;
  cancelAnimationFrame(S.raf);
  setStatus('idle');
  document.body.classList.remove('go','short','stop');
  clockEl.textContent='00:00';
  log('Stopped');
}

startBtn.onclick = start;
pauseBtn.onclick = pause;
resetBtn.onclick = stop;

// ---- Settings + Toggles
gearBtn.onclick = ()=> settings.style.display = 'block';
closeSettings.onclick = ()=> settings.style.display = 'none';
defaultsBtn.onclick = ()=>{
  colorMode.checked = false;
  audioMode.value = 'voiceWhistle';
  countdownMode.value = 'standard';
  voiceEl.value = 'on';
  volumeEl.value = 0.9;
};
if(stageToggle){
  stageToggle.onclick = ()=>{
    document.body.classList.toggle('stage');
    stageToggle.textContent = document.body.classList.contains('stage') ? 'Normal clock' : 'Big clock';
  };
}
if(themeToggle){
  themeToggle.onclick = ()=>{
    document.body.classList.toggle('theme-day');

    const isDay = document.body.classList.contains('theme-day');
    themeToggle.textContent = isDay ? 'Night mode' : 'Day mode';

    setBodyColor('');
  };
}
// ---- Init
(function init(){
  if('wakeLock' in navigator){
    navigator.wakeLock.request('screen').catch(()=>{});
  }
  loadConcepts();
  loadPresets();
  loadSelection();
  setTrainerPanel();
})();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(()=>{});
  });
}

// existing external entry point
window.startSandmanTimer = function (packName, presetId) {
  if (!PACKS[packName]) return;
  conceptEl.value = packName;
  loadPresets();
  presetEl.value = presetId;
  loadSelection();
  start();
};

(function applyTrainerParams(){
  const qs = new URLSearchParams(window.location.search);
  const track = qs.get('track');
  const tier = qs.get('tier');
  const trainer = qs.get('trainer') || 'shadow';
  const mode = qs.get('mode') || trainer;

  if (!track || !tier) return;

  const defaults = TRAINER_DEFAULTS?.[track]?.[tier];
  const sequence = TRAINER_SCRIPTS?.[track]?.[tier]?.[mode] || defaults?.sequence || 'basic';

  if (!defaults) {
    setTrainerPanel(track, tier, mode, sequence);
    return;
  }

  let chosenConcept = defaults.concept;
  let chosenPreset = defaults.preset;

  if (mode === 'fight') {
    chosenConcept = 'Fight Timers';
    if (track === 'youth') {
      if (tier === 't0' || tier === 't1') chosenPreset = 'fight_45';
      else if (tier === 't2' || tier === 't3') chosenPreset = 'fight_60';
      else if (tier === 't4' || tier === 't5') chosenPreset = 'fight_90';
      else chosenPreset = 'fight_180';
    } else {
      if (tier === 't0') chosenPreset = 'fight_60';
      else if (tier === 't1') chosenPreset = 'fight_90';
      else if (tier === 't2') chosenPreset = 'fight_180';
      else chosenPreset = 'fight_300';
    }
  }

  if (mode === 'solo') {
    chosenConcept = 'Solo Blocks';
    if (track === 'teen') chosenPreset = 'solo_15';
    if (track === 'youth' && (tier === 't6' || tier === 't7')) chosenPreset = 'solo_15';
    if (track === 'youth' && !(tier === 't6' || tier === 't7')) chosenPreset = 'solo_10';
  }

  conceptEl.value = chosenConcept;
  loadPresets();
  presetEl.value = chosenPreset;
  loadSelection();

  setTrainerPanel(track, tier, mode, sequence);
  log(`Trainer loaded: ${track.toUpperCase()} ${tier.toUpperCase()} | ${mode.toUpperCase()} | ${sequence.toUpperCase()}`);
})();
