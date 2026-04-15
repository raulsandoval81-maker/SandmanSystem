function paintLang(lang){

const showEN = lang === "en";

document.querySelectorAll(".en").forEach(el=>{
el.style.display = showEN ? "" : "none";
});

document.querySelectorAll(".es").forEach(el=>{
el.style.display = showEN ? "none" : "";
});

}

const buttons = document.querySelectorAll(".parent-lang-btn");

function setLang(lang){

localStorage.setItem("lang",lang);

buttons.forEach(btn=>{
btn.classList.toggle("active",btn.dataset.lang===lang);
});

paintLang(lang);

}

document.addEventListener("DOMContentLoaded",()=>{

const saved = localStorage.getItem("lang") || "en";

setLang(saved);

buttons.forEach(btn=>{
btn.addEventListener("click",()=>setLang(btn.dataset.lang));
});

});
function setTheme(mode){
  document.body.classList.remove("day","night");
  document.body.classList.add(mode);
  localStorage.setItem("theme", mode);
}

document.addEventListener("DOMContentLoaded", () => {
  const savedTheme = localStorage.getItem("theme") || "day";
  setTheme(savedTheme);

  const themeBtn = document.getElementById("themeToggle");
  themeBtn?.addEventListener("click", () => {
    const isDay = document.body.classList.contains("day");
    setTheme(isDay ? "night" : "day");
  });
});