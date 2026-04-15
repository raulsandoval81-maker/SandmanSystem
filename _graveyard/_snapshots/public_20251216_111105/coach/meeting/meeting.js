const $ = (s)=>document.querySelector(s);
const $$ = (s)=>document.querySelectorAll(s);

const dict = {
  en: {
    brand: "Lompoc HS Wrestling",
    heroTitle: "Home of the Braves",
    heroSub: "Parent Meeting • Follow-Up<br/><em>Reunión de Padres • Seguimiento</em>",
    openPortal: "Parent Info & Links",
    openComms: "Coach Messages",
    openQna: "Ask a Question",
    linksNote: "Bilingual pages. Save this link for later.",

    secOpening: "Opening — Calm & Confident",
    secOpeningBody: "Thanks for making time again tonight. Last week was quick — tonight is clarity and direction. The culture is already in the room; my job is to protect it.",

    secPolicy: "1) Team Policy & Conduct",
    secPolicyBody: "Attendance is mandatory unless cleared with Coach. Respect starts with showing up prepared, on time, focused. Grades = eligibility = trust. If you’re early, you’re on time; if you’re on time, you’re late. Practice discipline: hygiene, attitude, teamwork. Adults-only meeting for clear communication.",

    secSchedule: "2) Schedule & Travel",
    secScheduleBody: "Review boys/girls calendars. January gets busy. For overnights: behavior and supervision standards — no exceptions. Team stays together; parents coordinate through Coach. Volunteers appreciated (snacks, transport, chaperones).",

    secWeight: "3) Weight & Hydration",
    secWeightBody: "Follow CIF safety and hydration policies — no crash cutting. Parents: reinforce healthy eating, sleep, and recovery. Safety > short-term results.",

    secTeamParents: "4) Team Parents & Support",
    secTeamParentsBody: "Maya (Boys Team Parent). Girls Team Parent TBD. Team Parents handle organization and reminders — not decisions. Positive sideline energy; one unified front.",

    secComms: "5) Communication",
    secCommsBody: "Fast, clear, direct. Text or call Coach directly; don’t route through athletes. Team Parents send reminders only. No sideline coaching/post-match debates. A simple bilingual update page is in testing; for now we keep it direct.",

    secCulture: "6) Culture Message",
    secCultureBody: "These kids show respect, effort, and discipline — that’s rare. When home and mat are aligned, they compete free. Our job is to stay calm, consistent, and unified.",

    secClosing: "7) Closing",
    secClosingBody: "We’re ahead of schedule — we keep stacking days. Thank you for trusting me with your kids. Short Q&A after; private questions in the hallway.",

    footer: "Lompoc High School Wrestling • Mobile Meeting Guide",
  },
  es: {
    brand: "Lompoc HS Lucha",
    heroTitle: "Hogar de los Braves",
    heroSub: "Reunión de Padres • Seguimiento<br/><em>Parent Meeting • Follow-Up</em>",
    openPortal: "Información y Enlaces para Padres",
    openComms: "Mensajes del Entrenador",
    openQna: "Hacer una Pregunta",
    linksNote: "Páginas bilingües. Guarde este enlace para después.",

    secOpening: "Apertura — Tranquila y Segura",
    secOpeningBody: "Gracias por hacerse el tiempo otra vez. La semana pasada fue breve; hoy buscamos claridad y dirección. La cultura ya está aquí; mi trabajo es protegerla.",

    secPolicy: "1) Normas y Conducta",
    secPolicyBody: "Asistencia obligatoria salvo que se avise al Entrenador. El respeto empieza llegando preparado, a tiempo y enfocado. Calificaciones = elegibilidad = confianza. Si llegas temprano, llegas a tiempo; si llegas a tiempo, llegas tarde. Disciplina en práctica: higiene, actitud, trabajo en equipo. Reunión solo para adultos para una comunicación clara.",

    secSchedule: "2) Horario y Viajes",
    secScheduleBody: "Revisamos calendarios de varones y mujeres. Enero se llena. En viajes con noche: normas de conducta y supervisión — sin excepciones. El equipo se mantiene junto; los padres coordinan por medio del Entrenador. Se agradecen voluntarios (snacks, transporte, chaperones).",

    secWeight: "3) Peso e Hidratación",
    secWeightBody: "Seguimos las normas CIF de seguridad e hidratación — nada de cortes extremos. En casa: fomenten buena alimentación, sueño y recuperación. La seguridad es más importante que resultados rápidos.",

    secTeamParents: "4) Padres de Equipo y Apoyo",
    secTeamParentsBody: "Maya (Padre de Equipo de Varones). Falta designar en Femenil. Padres de Equipo organizan y recuerdan — no deciden. Energía positiva en la tribuna; un solo frente.",

    secComms: "5) Comunicación",
    secCommsBody: "Rápida, clara y directa. Envíen texto o llamen al Entrenador; no pasen mensajes por los atletas. Padres de Equipo solo envían recordatorios. Sin indicaciones desde la tribuna ni debates después del combate. Una página bilingüe de avisos está en prueba; por ahora, mantendremos lo directo.",

    secCulture: "6) Mensaje de Cultura",
    secCultureBody: "Estos jóvenes muestran respeto, esfuerzo y disciplina — eso es raro. Cuando hogar y tapiz están alineados, compiten con libertad. Nuestro trabajo es mantenernos tranquilos, constantes y unidos.",

    secClosing: "7) Cierre",
    secClosingBody: "Vamos adelantados — sigamos apilando días. Gracias por confiarme a sus hijos. Preguntas breves al final; dudas privadas en el pasillo.",

    footer: "Lompoc High School Wrestling • Guía Móvil de la Reunión",
  }
};

let lang = "en";
const btnEN = document.getElementById("btnEN");
const btnES = document.getElementById("btnES");

function paint(){
  document.querySelectorAll("[data-i18n]").forEach(el=>{
    const key = el.getAttribute("data-i18n");
    el.innerHTML = dict[lang][key] || "";
  });
  btnEN.classList.toggle("active", lang==="en");
  btnES.classList.toggle("active", lang==="es");
}
btnEN.addEventListener("click", ()=>{ lang="en"; paint(); });
btnES.addEventListener("click", ()=>{ lang="es"; paint(); });
paint();
