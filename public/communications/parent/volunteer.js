import {
  db,
  collection,
  addDoc,
  doc,
  serverTimestamp,
  auth
} from "/assets/js/firebase-init-para.js";

const dict = {
  en:{
    heroTitle:"Volunteer Interest Form",
    heroSub:"Help support Lompoc Academy of Wrestling • Ayude a apoyar a Lompoc Academia de Lucha",
    infoHead:"Basic Information / Información básica",
    labelParent:"Parent/Guardian Name / Nombre del padre/madre",
    labelAthlete:"Athlete Name / Nombre del atleta",
    labelPhone:"Phone / Teléfono",
    labelEmail:"Email / Correo electrónico",
    labelLanguage:"Preferred Language / Idioma preferido",
    optSelect:"Select / Seleccione",
    optEnglish:"English",
    optSpanish:"Español",
    optBoth:"Both / Ambos",
    helpHead:"Ways I Can Help / Formas en que puedo ayudar",
    helpIntro:"Check any areas where you might be willing to help this season. This is not a contract — it just lets us know who to contact.",
    help1:"Rides / Transportation",
    help2:"Snacks / Meals",
    help3:"Scorekeeping / Table",
    help4:"Tournament Help",
    help5:"Fundraising / Sponsorships",
    help6:"Team Events (banquet, senior night)",
    help7:"Photos / Video",
    help8:"Wherever Needed / Donde sea necesario",
    labelNotes:"Notes / Notas (schedule, skills, ideas)",
    btnSubmit:"Submit to Coaches",
    btnBack:"Back to Para-Comms",
    submitting:"Submitting...",
    success:"Volunteer form submitted.",
    error:"Unable to submit form.",
    required:"Please fill in parent name, athlete name, and at least one contact method.",
    oneHelp:"Please select at least one area where you can help."
  },
  es:{
    heroTitle:"Formulario de Interés para Voluntarios",
    heroSub:"Ayude a apoyar a Lompoc Academia de Lucha",
    infoHead:"Información básica / Basic Information",
    labelParent:"Nombre del padre/madre / Parent/Guardian Name",
    labelAthlete:"Nombre del atleta / Athlete Name",
    labelPhone:"Teléfono / Phone",
    labelEmail:"Correo electrónico / Email",
    labelLanguage:"Idioma preferido / Preferred Language",
    optSelect:"Seleccione / Select",
    optEnglish:"Inglés",
    optSpanish:"Español",
    optBoth:"Ambos / Both",
    helpHead:"Formas en que puedo ayudar / Ways I Can Help",
    helpIntro:"Marque las áreas donde podría ayudar esta temporada. Esto no es un contrato; solo nos ayuda a saber a quién contactar.",
    help1:"Transportación / Rides",
    help2:"Snacks / Comidas",
    help3:"Anotación / Mesa",
    help4:"Ayuda en torneos",
    help5:"Recaudación de fondos / Patrocinios",
    help6:"Eventos del equipo (banquete, noche de seniors)",
    help7:"Fotos / Video",
    help8:"Donde sea necesario / Wherever Needed",
    labelNotes:"Notas (horario, habilidades, ideas)",
    btnSubmit:"Enviar a entrenadores",
    btnBack:"Volver a Para-Comms",
    submitting:"Enviando...",
    success:"Formulario enviado.",
    error:"No se pudo enviar el formulario.",
    required:"Complete el nombre del padre/madre, el nombre del atleta y al menos una forma de contacto.",
    oneHelp:"Seleccione al menos una forma en que puede ayudar."
  }
};

const $ = (id) => document.getElementById(id);
let submitting = false;

function currentLang() {
  return localStorage.getItem("lang") || "en";
}

function paintVolunteer(lang) {
  const L = lang || currentLang();
  const bundle = dict[L] || dict.en;

  document.querySelectorAll("[data-i18n]").forEach(el => {
    const key = el.getAttribute("data-i18n");
    if (bundle[key]) el.innerHTML = bundle[key];
  });

  document.querySelectorAll(".parent-lang-btn").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.lang === L);
  });

  localStorage.setItem("lang", L);
}

function setStatus(msg, ok = false) {
  const el = $("status");
  if (!el) return;
  el.textContent = msg || "";
  el.className = `status ${ok ? "ok" : "err"}`;
}

function getHelpAreas() {
  return Array.from(document.querySelectorAll(".helpBox:checked")).map(cb => cb.value);
}

function resetForm() {
  $("parentName").value = "";
  $("athleteName").value = "";
  $("phone").value = "";
  $("email").value = "";
  $("language").value = "";
  $("notes").value = "";
  document.querySelectorAll(".helpBox").forEach(cb => { cb.checked = false; });
}

async function submitVolunteerForm() {
  if (submitting) return;
  submitting = true;

  const L = currentLang();
  const bundle = dict[L] || dict.en;

  const parentName = $("parentName").value.trim();
  const athleteName = $("athleteName").value.trim();
  const phone = $("phone").value.trim();
  const email = $("email").value.trim();
  const preferredLanguage = $("language").value || "";
  const notes = $("notes").value.trim();
  const helpAreas = getHelpAreas();

  if (!parentName || !athleteName || (!phone && !email)) {
    setStatus(bundle.required, false);
    submitting = false;
    return;
  }

  if (!helpAreas.length) {
    setStatus(bundle.oneHelp, false);
    submitting = false;
    return;
  }

  const type = helpAreas.join(" • ");
  const availability = preferredLanguage || "not set";
  const parentUid = auth?.currentUser?.uid || null;

  const btn = $("btn-submit");
  const original = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = `⏳ ${bundle.submitting}`;
  setStatus("");

  try {
    const inboxRef = await addDoc(collection(db, "paraVolunteerInbox"), {
      parentEmail: email,
      parentName,
      athlete: athleteName,
      subject: "Volunteer Interest",
      status: "open",
      source: "parent-volunteer-form",
      linkedVolunteerId: "",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      coachHasUnread: true,
      parentHasUnread: false,
      seenByCoach: false,
      seenByParent: true,
      parentUid,

      // extra detail fields
      type,
      availability,
      phone,
      preferredLanguage,
      helpAreas,
      notes
    });

    await addDoc(collection(doc(db, "paraVolunteerInbox", inboxRef.id), "thread"), {
      from: "parent",
      fromName: parentName,
      body: notes || `Volunteer areas: ${helpAreas.join(", ")}`,
      createdAt: serverTimestamp(),
      seenByCoach: false,
      seenByParent: true
    });

    setStatus(bundle.success, true);
    resetForm();
  } catch (err) {
    console.error("Volunteer submit failed:", err);
    setStatus(bundle.error, false);
  } finally {
    submitting = false;
    btn.disabled = false;
    btn.innerHTML = original;
  }
}

document.addEventListener("DOMContentLoaded", () => {
  document.querySelectorAll(".parent-lang-btn").forEach(btn => {
    btn.addEventListener("click", () => paintVolunteer(btn.dataset.lang));
  });

  paintVolunteer();
  $("btn-submit")?.addEventListener("click", submitVolunteerForm);
});