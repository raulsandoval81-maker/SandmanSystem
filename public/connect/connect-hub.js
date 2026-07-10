console.log("Sandman Connect Hub Loaded");

const cards =
document.querySelectorAll(".card");

cards.forEach(card=>{

card.addEventListener("mouseenter",()=>{

card.style.boxShadow=
"0 12px 30px rgba(0,0,0,.35)";

});

card.addEventListener("mouseleave",()=>{

card.style.boxShadow="none";

});

});