// include.js
document.addEventListener("DOMContentLoaded", function () {
  const includes = document.querySelectorAll("[data-include]");

  includes.forEach(el => {
    const file = el.getAttribute("data-include");
    if (file) {
      fetch(file)
        .then(res => {
          if (res.ok) return res.text();
          throw new Error(`Failed to load ${file}`);
        })
        .then(data => {
          el.innerHTML = data;
        })
        .catch(err => {
          console.error(err);
          el.innerHTML = `<div style="color:red;">Include failed: ${file}</div>`;
        });
    }
  });
});
