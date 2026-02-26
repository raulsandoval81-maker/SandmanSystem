// badge-shield.js — renders a rank shield (uses .shield CSS)
export function renderShield(el, { label="RANK", tone="#FFD700", text="#111" }={}){
  if(!el) return;
  el.innerHTML = `
  <div class="shield" style="--tone:${tone}; --txt:${text}">
    <svg viewBox="0 0 100 120" class="shield__svg" aria-hidden="true">
      <defs>
        <linearGradient id="g" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stop-color="#fff" stop-opacity=".55"/>
          <stop offset=".08" stop-color="#fff" stop-opacity=".15"/>
          <stop offset=".5" stop-color="#000" stop-opacity=".05"/>
          <stop offset="1" stop-color="#000" stop-opacity=".3"/>
        </linearGradient>
      </defs>
      <path d="M50 5 L90 20 V60 C90 85 70 105 50 115 C30 105 10 85 10 60 V20 Z" fill="var(--tone)"></path>
      <path d="M50 5 L90 20 V60 C90 85 70 105 50 115 C30 105 10 85 10 60 V20 Z" fill="url(#g)"></path>
    </svg>
    <span class="shield__label">${label}</span>
  </div>`;
}
