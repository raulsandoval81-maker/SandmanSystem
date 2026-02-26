// Athletes Motivation shell (no Firebase; 20% wiring)
console.log('[Athletes Motivation] JS loaded');
const $ = (id) => document.getElementById(id);
const setStatus = (m) => { const s = $('status'); if (s) s.textContent = m; };
document.addEventListener('DOMContentLoaded', () => setStatus('Ready.'));
