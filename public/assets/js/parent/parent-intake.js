// /public/js/parent/parent-intake.js
// Parent Intake (test Firebase shim + future Firestore). Keep camelCase.
// Exposes window.piSubmit() to match your inline onclick.

(() => {
  const qs = (id) => /** @type {HTMLInputElement|HTMLTextAreaElement} */(document.getElementById(id));
  const getParam = (k) => new URLSearchParams(location.search).get(k) || '';

  // Minimal guard in case DB shim isn't loaded yet
  function requireDB() {
    if (!window.DB || typeof DB.add !== 'function') {
      console.warn('[intake] DB shim not ready.');
      return false;
    }
    return true;
  }

  function readForm() {
    return {
      // meta
      id: '',                         // let DB.add assign
      status: 'submitted',            // coach will flip to 'approved'/'active'
      createdAt: Date.now(),
      inviteToken: getParam('token') || '',      // from coach invite link (if present)
      source: 'parent_portal',

      // athlete
      athleteFirst: qs('pi-first')?.value.trim() || '',
      athleteLast:  qs('pi-last')?.value.trim() || '',
      athleteDob:   qs('pi-dob')?.value || '',

      // parent contacts
      parentEmail: qs('pi-parent-email')?.value.trim() || '',
      parentPhone: qs('pi-parent-phone')?.value.trim() || '',

      // emergency
      emergencyName:  qs('pi-emer-name')?.value.trim() || '',
      emergencyPhone: qs('pi-emer-phone')?.value.trim() || '',

      // health
      medicalNotes: qs('pi-med')?.value.trim() || ''
    };
  }

  function validate(data) {
    const errs = [];
    if (!data.athleteFirst) errs.push('Athlete first name is required.');
    if (!data.athleteLast)  errs.push('Athlete last name is required.');
    if (!data.parentEmail && !data.parentPhone) errs.push('Parent email or phone is required.');
    return errs;
  }

  async function createIntake(data) {
    // Write a single row into 'intakes'
    // In real Firestore you’ll likely key by token or temp UID; this stub just adds.
    return DB.add('intakes', data);
  }

  function setStatus(msg, ok = true) {
    const el = document.getElementById('pi-status');
    if (!el) return;
    el.textContent = msg;
    el.classList.toggle('error', !ok);
  }

  async function piSubmit() {
    if (!requireDB()) {
      setStatus('System not ready. Try again in a moment.', false);
      return;
    }
    const data = readForm();
    const errs = validate(data);
    if (errs.length) {
      setStatus(errs.join(' '), false);
      return;
    }

    try {
      const saved = await createIntake(data);
      setStatus('Submitted. Coach will review.');
      console.log('[intake] submitted', saved);

      // Optional: clear the form after save
      ['pi-first','pi-last','pi-dob','pi-parent-email','pi-parent-phone','pi-emer-name','pi-emer-phone','pi-med']
        .forEach(id => { const el = qs(id); if (el) el.value = ''; });
    } catch (e) {
      console.error('[intake] error', e);
      setStatus('Could not submit right now. Please try again.', false);
    }
  }

  // expose for inline onclick="piSubmit()"
  window.piSubmit = piSubmit;

  // Small nicety: show token presence to parent (invisibly in console)
  const tok = getParam('token');
  if (tok) console.log('[intake] invite token detected:', tok);
})();
