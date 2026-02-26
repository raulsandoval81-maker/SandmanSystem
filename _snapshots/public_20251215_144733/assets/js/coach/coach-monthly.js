;(() => {
  const SM = window.Sandman;
  const { DB, Audience } = SM;

  // Leadership console stubs
  window.leadEnroll = async function(){ console.log('leadEnroll (stub)'); };
  window.leadUnenroll = async function(){ console.log('leadUnenroll (stub)'); };

  // Monthly reflection stubs reuse mockSave/Send if present
  window.monthlySaveLog = async function() {
    const title = document.getElementById('coach-monthly-title')?.value || '';
    const body  = document.getElementById('coach-monthly-note')?.value || '';
    await DB.add('logs', { kind:'weekly_summary', scope:'monthly', text:`${title}\n\n${body}`, audience: Audience.allThree(), ts: Date.now(), by:'coach' });
  };
})();
