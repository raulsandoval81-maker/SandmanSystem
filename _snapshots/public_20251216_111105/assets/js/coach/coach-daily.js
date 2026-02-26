;(() => {
  const SM = window.Sandman;
  const { DB, Audience } = SM;

  // Attendance / character quick picks (stub; wire to XP engine later)
  window.safeCallInc = async function(kind, sub, note='') {
    // TODO: route through XP gateway
    console.log('safeCallInc', { kind, sub, note });
    await DB.add('logs', { kind: 'audit', text:`XP stub: ${kind} ${sub||''} ${note||''}`.trim(), audience: Audience.coachOnly(), ts: Date.now(), by:'coach' });
    return true;
  };

  // Coach Daily Log (stub)
  window.mockSave = async function(scope='daily') {
    const text = document.getElementById('coach-daily-note')?.value || '';
    await DB.add('logs', { kind:'practice_note', scope:'daily', text, audience: Audience.coachAth(), ts: Date.now(), by:'coach' });
    return true;
  };

  window.mockSend = async function(scope='daily'){
    console.log('Send (stub)', scope);
    return true;
  };
})();
