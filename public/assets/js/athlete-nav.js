import { auth } from "/assets/js/firebase-init.js";
import { resolveSignedInSelfAthlete } from "/assets/js/athlete-dashboard-data.js";
import { athleteExperience, canonicalAthleteHref, persistVerifiedAthleteId, clearUnverifiedAthleteId } from "/assets/js/athlete-journey-routes.js";
import { signOut } from "https://www.gstatic.com/firebasejs/10.13.1/firebase-auth.js";

const THEME_KEY = "sandman-athlete-theme";
const MOTION_KEY = "sandman-athlete-motion";
const LANGUAGE_KEY = "sandman-athlete-language";
const ID_KEYS = ["sandman_lastAthleteUid", "currentAthleteId"];
const params = new URLSearchParams(location.search);


let id = "";

function route(path){
  return id ? canonicalAthleteHref(path, id) : path;
}

const youthItems = [
  ["Home", "/athletes/hub/"],
  ["My Progress", "/athletes/profile/"],
  ["Arsenal", "/athletes/arsenal/"]
];

const fullItems = [
  ["Home", "/athletes/hub/"],
  ["My Progress", "/athletes/profile/"],
  ["Arsenal", "/athletes/arsenal/"],
  ["Schedule", "/communications/athlete/schedule.html"],
  ["Communications", "/communications/athlete/"],
  ["Announcements", "/athletes/bulletin/announcements.html", "child"],
  ["Leaderboard", "/athletes/leaderboard/"]
];

let items = [];

function active(path){
  const here=location.pathname;
  if(path==="/athletes/hub/") return here.startsWith("/athletes/hub/");
  if(path==="/athletes/arsenal/" && here.startsWith("/athletes/lanes/")) return true;
  if(path==="/communications/athlete/") return here==="/communications/athlete/" || here.endsWith("/communications/athlete/index.html");
  if(path.includes("announcements")) return here.includes("announcements");
  if(path.includes("schedule")) return here.includes("schedule");
  return here.startsWith(path);
}

const spanish = {
  "Menu":"Menú","Home":"Inicio","My Progress":"Mi progreso","Arsenal":"Arsenal",
  "Schedule":"Horario","Communications":"Comunicaciones","Announcements":"Anuncios",
  "Leaderboard":"Clasificación","Athlete Menu":"Menú del atleta","Your journey":"Tu camino",
  "Athlete":"Atleta","Settings":"Configuración","Athlete Preferences":"Preferencias del atleta",
  "Sign Out":"Cerrar sesión","View avatar & profile":"Ver avatar y perfil",
  "Display preferences apply to this device. Avatar editing is not available here yet.":"Las preferencias de pantalla se guardan en este dispositivo. Aún no se puede editar el avatar aquí.",
  "Appearance":"Apariencia","Night":"Noche","Day":"Día","Reduced motion":"Movimiento reducido",
  "On":"Sí","Off":"No","Language":"Idioma"
};
function language(){return document.documentElement.dataset.athleteLanguage==="es"?"es":"en"}
function t(value){return language()==="es"?(spanish[value]||value):value}
function applyLanguage(value){
  const chosen=value==="es"?"es":"en";
  document.documentElement.dataset.athleteLanguage=chosen;
  document.documentElement.lang=chosen;
  localStorage.setItem(LANGUAGE_KEY,chosen);
  const chooser=document.querySelector("[data-athlete-language]");
  if(chooser) chooser.value=chosen;
  const labels=[
    [".athlete-menu-button span:last-child","Menu"],
    [".athlete-drawer__identity strong","Athlete Menu"],
    [".athlete-drawer__identity span","Your journey"],
    [".athlete-nav__label","Athlete"],
    [".athlete-preferences > summary","Settings"],
    [".athlete-preferences__heading","Athlete Preferences"],
    ["[data-athlete-profile-link]","View avatar & profile"],
    [".athlete-preferences__note","Display preferences apply to this device. Avatar editing is not available here yet."],
    ["[data-athlete-signout]","Sign Out"],
    ["[data-athlete-language-label]","Language"],
  ];
  for(const [selector,key] of labels){
    const node=document.querySelector(selector);
    if(node) node.textContent=t(key);
  }
  const links=document.querySelectorAll("[data-athlete-links] a[data-athlete-label]");
  for(const link of links) link.textContent=t(link.dataset.athleteLabel);
  applyTheme(document.documentElement.dataset.athleteTheme||"day");
  applyMotion(document.documentElement.dataset.athleteMotion||"standard");
}
function applyTheme(theme){
  const value=theme==="night"?"night":"day";
  document.documentElement.dataset.athleteTheme=value;
  localStorage.setItem(THEME_KEY,value);
  const button=document.querySelector("button[data-athlete-theme]");
  if(button){
    button.textContent=`${t("Appearance")}: ${t(value==="night"?"Night":"Day")}`;
    button.setAttribute("aria-label",`${t("Appearance")}: ${t(value==="night"?"Night":"Day")}`);
    button.setAttribute("aria-pressed",String(value==="night"));
  }
}

function applyMotion(motion){
  const value=motion==="reduced"?"reduced":"standard";
  document.documentElement.dataset.athleteMotion=value;
  localStorage.setItem(MOTION_KEY,value);
  const button=document.querySelector("button[data-athlete-motion]");
  if(button){
    button.textContent=`${t("Reduced motion")}: ${t(value==="reduced"?"On":"Off")}`;
    button.setAttribute("aria-pressed",String(value==="reduced"));
  }
}

let shellInitialized=false;
function initializeAthleteShell(){
if(shellInitialized || !document.body) return;
shellInitialized=true;
document.body.classList.add("athlete-app");

const header=document.createElement("header");
header.className="athlete-shell-header";
header.innerHTML=`<div class="athlete-shell-header__inner"><button class="athlete-menu-button" type="button" aria-expanded="false" aria-controls="athleteDrawer"><span class="athlete-menu-button__icon" aria-hidden="true">☰</span><span>Menu</span></button><div class="athlete-shell-brand"><strong>Sandman Athlete</strong><span>Combat · Strength · Honor</span></div></div>`;

const drawer=document.createElement("aside");
drawer.id="athleteDrawer";drawer.className="athlete-drawer";drawer.setAttribute("aria-label","Athlete navigation");drawer.setAttribute("aria-hidden","true");
drawer.innerHTML=`<div class="athlete-drawer__top"><div class="athlete-drawer__identity"><strong>Athlete Menu</strong><span>Your journey</span></div><button class="athlete-drawer-close" type="button" aria-label="Close menu">×</button></div><nav class="athlete-nav"><p class="athlete-nav__label">Athlete</p><div data-athlete-links></div><details class="athlete-preferences"><summary>Settings</summary><div class="athlete-preferences__body"><p class="athlete-preferences__heading">Athlete Preferences</p><button type="button" data-athlete-theme aria-pressed="false">Appearance: Day</button><button type="button" data-athlete-motion aria-pressed="false">Reduced motion: Off</button><label class="athlete-preferences__language"><span data-athlete-language-label>Language</span><select data-athlete-language aria-label="Athlete display language"><option value="en">English</option><option value="es">Español</option></select></label><a data-athlete-profile-link hidden>View avatar &amp; profile</a><p class="athlete-preferences__note">Display preferences apply to this device. Avatar editing is not available here yet.</p></div></details><button class="athlete-nav__signout" type="button" data-athlete-signout>Sign Out</button></nav>`;

const backdrop=document.createElement("button");backdrop.type="button";backdrop.className="athlete-drawer-backdrop";backdrop.setAttribute("aria-label","Close Athlete navigation");backdrop.tabIndex=-1;
document.body.prepend(backdrop);document.body.prepend(drawer);document.body.prepend(header);

const footer=document.createElement("footer");footer.className="athlete-shell-footer";footer.textContent="Sandman System · Athlete Experience";document.body.append(footer);
applyTheme(localStorage.getItem(THEME_KEY) || "day");
applyMotion(localStorage.getItem(MOTION_KEY) || (window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ? "reduced" : "standard"));
applyLanguage(localStorage.getItem(LANGUAGE_KEY) || "en");
const menu=header.querySelector(".athlete-menu-button");const closeButton=drawer.querySelector(".athlete-drawer-close");let returnFocus=null;
menu.disabled=true;
function openDrawer(){returnFocus=document.activeElement;drawer.classList.add("is-open");backdrop.classList.add("is-open");drawer.setAttribute("aria-hidden","false");menu.setAttribute("aria-expanded","true");document.documentElement.classList.add("athlete-drawer-open");closeButton.focus()}
function closeDrawer(){drawer.classList.remove("is-open");backdrop.classList.remove("is-open");drawer.setAttribute("aria-hidden","true");menu.setAttribute("aria-expanded","false");document.documentElement.classList.remove("athlete-drawer-open");if(returnFocus instanceof HTMLElement)returnFocus.focus()}
menu.addEventListener("click",openDrawer);closeButton.addEventListener("click",closeDrawer);backdrop.addEventListener("click",closeDrawer);
// Drawer links are inserted only after authenticated ownership resolution.
document.addEventListener("keydown",(event)=>{if(event.key==="Escape"&&drawer.classList.contains("is-open"))closeDrawer();if(event.key==="Tab"&&drawer.classList.contains("is-open")){const focusable=[...drawer.querySelectorAll('a:not([hidden]),button:not([disabled]),summary,select')].filter(element=>element.getClientRects().length>0);const first=focusable[0],last=focusable.at(-1);if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus()}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus()}}});
drawer.querySelector("[data-athlete-theme]").addEventListener("click",()=>applyTheme(document.documentElement.dataset.athleteTheme==="night"?"day":"night"));
drawer.querySelector("[data-athlete-motion]").addEventListener("click",()=>applyMotion(document.documentElement.dataset.athleteMotion==="reduced"?"standard":"reduced"));
drawer.querySelector("[data-athlete-language]").addEventListener("change",event=>applyLanguage(event.target.value));
drawer.querySelector("[data-athlete-signout]").addEventListener("click",async()=>{try{await signOut(auth)}finally{ID_KEYS.forEach((key)=>localStorage.removeItem(key));sessionStorage.removeItem("currentAthleteId");location.replace("/athletes/auth/")}});
async function hydrateNavigation(){
  try {
    const resolved = await resolveSignedInSelfAthlete();
    if(!resolved.athleteId || !resolved.athlete){
      // These shared Profile pages are also used by scoped Coach viewers.
      // No Athlete drawer links without Athlete ownership, but leave the
      // existing Coach-controlled page to enforce its own Firestore scope.
      drawer.querySelector("[data-athlete-links]").textContent="Athlete menu unavailable in this view";
      return;
    }
    id=resolved.athleteId;
    persistVerifiedAthleteId(id);
    const experience=athleteExperience(resolved.athlete,id);
    if(!experience){
      clearUnverifiedAthleteId();
      drawer.querySelector("[data-athlete-links]").textContent="Journey unavailable";
      return;
    }
    items=experience==="mini"?youthItems:fullItems;
    const links=drawer.querySelector("[data-athlete-links]");
    links.innerHTML=items.map(([label,path,kind])=>`<a data-athlete-label="${label}" class="${kind?"athlete-nav__child":""}" href="${route(path)}" ${active(path)&&kind!=="child-secondary"?'aria-current="page"':""}>${t(label)}</a>`).join("");
    const profileLink=drawer.querySelector("[data-athlete-profile-link]");
    profileLink.href=route("/athletes/profile/");
    profileLink.hidden=false;
    links.querySelectorAll("a").forEach(link=>link.addEventListener("click",closeDrawer));
    menu.disabled=false;
    applyLanguage(language());

    // Route aliases and remembered IDs are never authoritative. For a direct
    // leaf-page link carrying a foreign ID, return to the verified router.
    const urlId=params.get("id") || params.get("athleteId") || params.get("uid");
    if(urlId && urlId!==id){
      const section=location.pathname.startsWith("/athletes/profile/")?"/athletes/profile/"
        :location.pathname.startsWith("/athletes/arsenal/")?"/athletes/arsenal/"
        :"/athletes/hub/";
      location.replace(canonicalAthleteHref(section,id));
    }
  } catch(error) {
    // Preserve Coach view context on a shared page; never grant Athlete nav.
    menu.disabled=true;
    console.error("[Athlete navigation] verified lookup failed:", error?.code || "runtime-error");
    drawer.querySelector("[data-athlete-links]").textContent="Athlete access unavailable";
  }
}
hydrateNavigation();

}

if(document.readyState==="loading"){
  document.addEventListener(
    "DOMContentLoaded",
    initializeAthleteShell,
    { once:true }
  );
}else{
  initializeAthleteShell();
}
