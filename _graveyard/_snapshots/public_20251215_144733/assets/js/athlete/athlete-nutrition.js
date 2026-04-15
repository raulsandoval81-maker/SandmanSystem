;(() => {
  const SM = window.Sandman;
  const { DB } = SM;

  window.nutLog = async function(){
    const meal = document.getElementById('nut-meal')?.value || 'Meal';
    const what = document.getElementById('nut-what')?.value || '';
    const kcal = Number(document.getElementById('nut-cals')?.value || 0);
    await DB.add('logs', { kind:'practice_note', scope:'daily', text:`Nutrition: ${meal} — ${what} (~${kcal} kcal)`, audience: SM.Audience.coachAth(), ts: Date.now(), by:'athlete' });
  };

  window.nutAddWater = (function(){
    let total = 0;
    return async function(){
      const oz = Number(document.getElementById('nut-water')?.value || 0);
      total += oz;
      document.getElementById('nut-water-total')?.replaceChildren(document.createTextNode(`Water today: ${total} oz`));
      await DB.add('logs', { kind:'practice_note', scope:'daily', text:`Water: +${oz} oz (total ${total})`, audience: SM.Audience.coachAth(), ts: Date.now(), by:'athlete' });
    };
  })();
})();
