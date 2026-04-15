;(() => {
  const SM = window.Sandman;
  const { DB } = SM;

  window.skAnalyze = async function(){
    const url   = document.getElementById('sk-url')?.value || '';
    const focus = document.getElementById('sk-focus')?.value || 'finishes';
    const li = `<li><strong>Analyzing</strong> ${focus} from ${url} … (stub)</li>`;
    document.getElementById('sk-feed')?.insertAdjacentHTML('afterbegin', li);
    await DB.add('logs', { kind:'ai_feedback', text:`Athlete video analyze: ${focus} ${url}`, ts: Date.now(), by:'athlete', audience: SM.Audience.coachAth() });
  };
})();
