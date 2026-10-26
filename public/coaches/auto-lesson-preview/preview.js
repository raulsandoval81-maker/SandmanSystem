import {assembleServerLessonPreview} from "/assets/js/auto/auto-lesson-assembly-preview.js";
import {createCoachPreviewState,reorderCoachSegment,setCoachSegmentMinutes,setCoachSegmentIncluded,
  chooseTrustedAlternative,restoreCoachProposal,coachPreviewSummary} from "/assets/js/auto/auto-lesson-coach-preview-model.js";
import {DEMONSTRATION_SOURCE} from "./demo-fixture.js";

const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const title = value => String(value || "").replaceAll("_", " ").replace(/\b\w/g, c => c.toUpperCase());
const source = window.__SANDMAN_PROTECTED_AUTO_PREVIEW__ || DEMONSTRATION_SOURCE;
const fixture = source === DEMONSTRATION_SOURCE;
let state = createCoachPreviewState(assembleServerLessonPreview(source), {fixture});

function evidenceFor(variation, athleteId) { return variation.evidenceProvenance?.find(item => item.athleteId === athleteId); }
function render() {
  const p = state.original, s = coachPreviewSummary(state);
  document.querySelector("#fixtureNotice").hidden = !state.fixture;
  document.querySelector("#overview").innerHTML = `<h2>Room overview</h2><div class="metric-grid">
    <div class="metric"><b>${title(p.discipline)}</b><span>${p.journey.toUpperCase()} · ${p.durationMinutes} minutes</span></div>
    <div class="metric"><b>${s.groupCount}</b><span>training groups</span></div><div class="metric"><b>${s.athleteCount}</b><span>athletes</span></div>
    <div class="metric"><b>${s.includedSegments}</b><span>room skill segments</span></div><div class="metric"><b>${s.allocatedMinutes}</b><span>allocated instructional minutes</span></div>
    <div class="metric"><b>${s.unallocatedMinutes}</b><span>minutes outside proposed instruction</span></div></div>`;
  document.querySelector("#segments").innerHTML = state.segments.map((segment,index) => `<article class="segment ${segment.included?"":"excluded"}" data-id="${esc(segment.id)}">
    <div class="segment-head"><div><span class="badge">${esc(segment.blockId)}</span> ${segment.shared?'<span class="badge">shared room instruction</span>':""}<h3>${esc(segment.familyLabel)}</h3></div>
    <div class="controls"><button data-move="up" ${index===0?"disabled":""} aria-label="Move up">↑</button><button data-move="down" ${index===state.segments.length-1?"disabled":""} aria-label="Move down">↓</button>
    <label>Minutes <input class="minutes" data-minutes type="number" min="1" value="${segment.proposedMinutes}"></label><label><input data-included type="checkbox" ${segment.included?"checked":""}> Include</label></div></div>
    <p class="comparison">Original proposal: ${segment.originalMinutes} minutes · Adjustments are local and temporary.</p>
    ${(segment.trustedAlternatives||[]).length?`<label>Trusted tied recommendation <select data-alternative><option value="">${esc(segment.familyLabel)}</option>${segment.trustedAlternatives.map(a=>`<option value="${esc(a.alternativeId)}">${esc(a.segment.familyLabel)}</option>`).join("")}</select></label>`:'<p class="muted">No trusted tied alternatives were supplied by the server.</p>'}
    <div class="variations">${segment.variations.map(v=>`<div class="variation"><h4>${esc(v.groupId)} · ${v.tier.toUpperCase()} ${esc(v.rankName)}</h4><p><strong>${esc(v.dominantTrack)}</strong> — ${esc(v.instructionalPurpose||"Develop this verified skill need")}</p><p>${v.athletes.length} athlete${v.athletes.length===1?"":"s"}</p><a class="card-link" href="${esc(v.card.href)}" target="_blank" rel="noopener">${esc(v.card.title||v.card.name||title(v.card.id))} ↗</a></div>`).join("")}</div></article>`).join("")+
    (state.adjustmentErrors.length?`<p class="error" role="alert">Adjustment rejected: ${state.adjustmentErrors.map(title).join(" · ")}</p>`:"");
  const variations = state.original.segments.flatMap(segment => segment.variations.map(v => ({...v,familyLabel:segment.familyLabel})));
  let athleteNumber = 0;
  document.querySelector("#athletes").innerHTML = `<table><thead><tr><th>Athlete</th><th>Journey / rank</th><th>Development track</th><th>Skill family</th><th>Evidence</th></tr></thead><tbody>${variations.flatMap(v=>v.athletes.map(a=>{const e=evidenceFor(v,a.athleteId),label=`Athlete ${++athleteNumber}`;return `<tr><td>${label}<details><summary>Source identity</summary><code>${esc(a.athleteId)}</code></details></td><td>P2L · ${v.tier.toUpperCase()} ${esc(v.rankName)}</td><td><strong>${esc(a.track)}</strong></td><td>${esc(v.familyLabel)}</td><td>${esc(e?.status||"Accepted source evidence")}<details><summary>Provenance</summary><code>${esc(e?.manifestId||"Not supplied")}</code><br>Review revision ${esc(e?.reviewRevision??"—")}</details></td></tr>`})).join("")}</tbody></table>`;
  document.querySelector("#review").innerHTML = `<p><strong>Authorization:</strong> ${esc(p.sourceAuthorizationStatus)}. Coach approval remains required. This adapter does not certify evidence.</p>
    <h3>Why these skills</h3>${variations.map(v=>`<p><strong>${esc(v.groupId)}:</strong> ${esc(v.instructionalPurpose||"Highest verified introduction/practice need not recently delivered")}</p>`).join("")}
    <h3>Coordination</h3>${p.segments.map(seg=>`<p>${seg.shared?"Shared":"Separate"}: <strong>${esc(seg.familyLabel)}</strong> — ${esc(seg.variations.map(v=>v.groupId).join(" + "))}</p>`).join("")}
    <h3>Blockers and required review</h3>${p.blockers.length?p.blockers.map(b=>`<div class="blocker">${esc(title(b))}</div>`).join(""):'<p>No mapping or capacity blockers. Coach approval is still required.</p>'}`;
  bind();
}
function bind(){document.querySelectorAll("[data-id]").forEach(el=>{const id=el.dataset.id;
  el.querySelectorAll("[data-move]").forEach(b=>b.onclick=()=>{state=reorderCoachSegment(state,id,b.dataset.move);render()});
  el.querySelector("[data-minutes]").onchange=e=>{state=setCoachSegmentMinutes(state,id,Number(e.target.value));render()};
  el.querySelector("[data-included]").onchange=e=>{state=setCoachSegmentIncluded(state,id,e.target.checked);render()};
  const alternatives=el.querySelector("[data-alternative]");if(alternatives)alternatives.onchange=e=>{if(!e.target.value)return;try{state=chooseTrustedAlternative(state,id,e.target.value)}catch(error){state={...state,adjustmentErrors:[error.message]}}render()};
});}
document.querySelector("#restore").onclick=()=>{state=restoreCoachProposal(state);render()};
render();
