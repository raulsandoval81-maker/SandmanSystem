// Athletes Calendar shell
console.log('[Athletes Calendar] JS loaded');
const $ = (id) => document.getElementById(id);
const setStatus = (m) => { const s = $('status'); if (s) s.textContent = m; };
document.addEventListener('DOMContentLoaded', () => setStatus('Ready.'));
