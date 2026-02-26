// Coaches Hub – minimal wiring for the two buttons and status

const $ = (id) => document.getElementById(id);
const statusEl = $('status');
const setStatus = (msg, cls = 'ok') => {
  statusEl.className = `status ${cls}`;
  statusEl.textContent = msg;
};

document.addEventListener('DOMContentLoaded', () => {
  // Navigate to existing pages
  $('newAthleteBtn')?.addEventListener('click', () => {
    location.href = './intake.html';
  });
  $('toolsBtn')?.addEventListener('click', () => {
    location.href = './tools.html';
  });

  setStatus('Ready.');
  console.log('[Hub] ready (tools-only).');
});
