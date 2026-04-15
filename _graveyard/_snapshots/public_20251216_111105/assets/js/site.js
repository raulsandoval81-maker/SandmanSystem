// site.js
document.addEventListener("DOMContentLoaded", function () {
  const includeElements = document.querySelectorAll("[data-include]");
  includeElements.forEach(el => {
    const file = el.getAttribute("data-include");
    if (file) {
      fetch(file)
        .then(response => {
          if (!response.ok) {
            throw new Error(`Failed to load ${file}: ${response.status}`);
          }
          return response.text();
        })
        .then(data => {
          el.innerHTML = data;

          // Re-run to handle nested includes
          if (el.querySelector("[data-include]")) {
            const nested = el.querySelectorAll("[data-include]");
            nested.forEach(nel => {
              const nestedFile = nel.getAttribute("data-include");
              if (nestedFile) {
                fetch(nestedFile)
                  .then(nestedRes => nestedRes.text())
                  .then(nestedData => {
                    nel.innerHTML = nestedData;
                  });
              }
            });
          }
        });
    }
  });
});


// Hamburger drawer controls
(function(){
  const btn = document.querySelector('.hamburger');
  const drawer = document.getElementById('mainmenu');
  const closeBtn = document.querySelector('.menu-close');

  if(!btn || !drawer) return;

  const open = () => {
    btn.setAttribute('aria-expanded', 'true');
    drawer.setAttribute('aria-hidden', 'false');
    // focus first link
    const firstLink = drawer.querySelector('a');
    if (firstLink) setTimeout(()=>firstLink.focus(), 120);
  };
  const close = () => {
    btn.setAttribute('aria-expanded', 'false');
    drawer.setAttribute('aria-hidden', 'true');
    btn.focus();
  };

  btn.addEventListener('click', () => {
    const expanded = btn.getAttribute('aria-expanded') === 'true';
    expanded ? close() : open();
  });
  closeBtn.addEventListener('click', close);

  // close on ESC
  window.addEventListener('keydown', (e)=>{ if(e.key === 'Escape') close(); });
  // close when clicking outside drawer
  window.addEventListener('click', (e)=>{
    if (drawer.getAttribute('aria-hidden') === 'true') return;
    const inside = drawer.contains(e.target) || btn.contains(e.target);
    if (!inside) close();
  });
})();
