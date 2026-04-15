(() => {
  const $ = (id) => document.getElementById(id);
const btn = document.getElementById("yourButtonId");
if (btn) {
  btn.addEventListener("click", () => {
    // your existing code
  });
}

  // Players + labels
  const video = $('videoPlayer');
  const vTitle = $('vTitle');
  const vClear = $('vClear');
  const podcast = $('podcastPlayer');
  const pTitle = $('pTitle');
  const pClear = $('pClear');

  // Library UI
  const libEl = $('lib');
  const tagFilter = $('tagFilter');
  const searchBox = $('searchBox');
  const resetFilter = $('resetFilter');

  // Persist last played
  const LAST = 'motivation.last';

  // Demo library (replace links anytime)
  /** type: 'video' | 'pod' */
  const LIB = [
    {
      type: 'video',
      title: 'Embrace the Grind',
      desc: 'Short talk on daily discipline and showing up.',
      tags: ['Mindset','Discipline'],
      // YouTube embed URL recommended (use embed form)
      url: 'https://www.youtube.com/embed/ZXsQAXx_ao0'
    },
    {
      type: 'video',
      title: 'Brotherhood',
      desc: 'Compete hard, care harder — on and off the mat.',
      tags: ['Brotherhood','Grit'],
      url: 'https://www.youtube.com/embed/d6wRkzCW5qI'
    },
    {
      type: 'video',
      title: 'Focus Under Pressure',
      desc: 'Breathing + reset cues for big moments.',
      tags: ['Focus','Mindset'],
      url: 'https://www.youtube.com/embed/2Lz0VOltZKA'
    },
    {
      type: 'pod',
      title: 'Coach’s Corner #12 — Showing Up',
      desc: '15-minute pep talk for mid-season fatigue.',
      tags: ['Discipline','Mindset'],
      // Any MP3 URL works; placeholder tone
      url: 'https://file-examples.com/storage/fe5e9b5e4e2d54f0e6c8e2b/2017/11/file_example_MP3_700KB.mp3'
    },
    {
      type: 'pod',
      title: 'Breath & Reset (2-min)',
      desc: 'Quick pre-match centering routine.',
      tags: ['Focus'],
      url: 'https://file-examples.com/storage/fe5e9b5e4e2d54f0e6c8e2b/2017/11/file_example_MP3_1MG.mp3'
    },
    {
      type: 'video',
      title: 'Finish What You Started',
      desc: 'Short reel to light the fuse.',
      tags: ['Grit'],
      url: 'https://www.youtube.com/embed/KxGRhd_iWuE'
    }
  ];

  function renderLibrary() {
    const tag = (tagFilter.value || '').trim();
    const q = (searchBox.value || '').trim().toLowerCase();

    const items = LIB.filter(item => {
      const okTag = !tag || item.tags.includes(tag);
      const okSearch = !q || (item.title.toLowerCase().includes(q) || (item.desc||'').toLowerCase().includes(q));
      return okTag && okSearch;
    });

    libEl.innerHTML = items.map((item, idx) => card(item, idx)).join('');
    libEl.querySelectorAll('button[data-idx]').forEach(btn => {
      btn.addEventListener('click', () => {
        const i = +btn.dataset.idx;
        play(LIB[i]);
      });
    });
  }

  function thumbFor(item){
    // Lightweight YouTube thumbnail if it's a YT embed link
    if (item.type === 'video' && item.url.includes('youtube.com/embed/')) {
      const id = item.url.split('/embed/')[1].split(/[?&]/)[0];
      return `https://img.youtube.com/vi/${id}/hqdefault.jpg`;
    }
    // Generic placeholder
    return item.type === 'video'
      ? 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360"><rect width="100%" height="100%" fill="%23000"/><text x="50%" y="50%" fill="white" font-size="28" text-anchor="middle" dominant-baseline="central">Video</text></svg>'
      : 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360"><rect width="100%" height="100%" fill="%23222"/><text x="50%" y="50%" fill="white" font-size="28" text-anchor="middle" dominant-baseline="central">Podcast</text></svg>';
  }

  function card(item, idx){
    const t = thumbFor(item);
    return `
      <article class="card">
        <div class="thumb" style="background-image:url('${t}');background-size:cover;background-position:center">
          <button data-idx="${idx}">Play</button>
        </div>
        <h4>${escapeHtml(item.title)}</h4>
        <p>${escapeHtml(item.desc||'')}</p>
        <div class="row" style="padding:0 10px 12px">
          ${item.tags.map(tag=>`<span class="chip">${escapeHtml(tag)}</span>`).join(' ')}
        </div>
      </article>
    `;
  }

  function play(item){
    if (item.type === 'video') {
      video.src = item.url; vTitle.textContent = item.title;
      // also clear podcast if switching modes
      podcast.pause(); podcast.src = ''; pTitle.textContent = 'Coach’s pick or your latest play.';
    } else {
      podcast.src = item.url; podcast.play().catch(()=>{});
      pTitle.textContent = item.title;
      // clear video if switching modes
      video.src = ''; vTitle.textContent = 'Pick a clip from the library to play.';
    }
    // persist
    localStorage.setItem(LAST, JSON.stringify(item));
  }

  function restoreLast(){
    try {
      const raw = localStorage.getItem(LAST);
      if (!raw) return;
      const last = JSON.parse(raw);
      // Only restore if it still exists
      const found = LIB.find(i => i.url === last.url && i.type === last.type);
      if (found) play(found);
    } catch {}
  }

  // Clear buttons
  vClear.addEventListener('click', () => { video.src=''; vTitle.textContent='Pick a clip from the library to play.'; localStorage.removeItem(LAST); });
  pClear.addEventListener('click', () => { podcast.pause(); podcast.src=''; pTitle.textContent='Coach’s pick or your latest play.'; localStorage.removeItem(LAST); });

  // Filters
  tagFilter.addEventListener('change', renderLibrary);
  searchBox.addEventListener('input', renderLibrary);
  resetFilter.addEventListener('click', () => { tagFilter.value=''; searchBox.value=''; renderLibrary(); });

  // Utils
  function escapeHtml(s){ return (s||'').replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

  // Init
  renderLibrary();
  restoreLast();
  console.log('[Motivation] Hub ready (video + podcast + library + filters).');
})();
