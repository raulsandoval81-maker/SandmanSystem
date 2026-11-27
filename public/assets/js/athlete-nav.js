import { auth } from "/assets/js/firebase-init.js";
import { resolveSignedInAthlete } from "/assets/js/athlete-dashboard-data.js";
import { athleteExperience, canonicalAthleteHref, persistVerifiedAthleteId, clearUnverifiedAthleteId } from "/assets/js/athlete-journey-routes.js";
import { signOut } from "https://www.gstatic.com/firebasejs/10.13.1/firebase-auth.js";

const THEME_KEY = "sandman-athlete-theme";
const ID_KEYS = ["sandman_lastAthleteUid", "currentAthleteId"];
const params = new URLSearchParams(location.search);

function athleteId(){
  return String(params.get("id") || params.get("athleteId") || params.get("uid") || ID_KEYS.map((key)=>localStorage.getItem(key)).find(Boolean) || sessionStorage.getItem("currentAthleteId") || "").trim();
}

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

function applyTheme(theme){
  const value=theme==="night"?"night":"day";
  document.documentElement.dataset.athleteTheme=value;
  localStorage.setItem(THEME_KEY,value);
  const button=document.querySelector("button[data-athlete-theme]");
  if(button){button.textContent=value==="night"?"Day":"Night";button.setAttribute("aria-label",`Switch to ${value==="night"?"Day":"Night"} appearance`)}
}

let shellInitialized=false;
function initializeAthleteShell(){
if(shellInitialized || !document.body) return;
shellInitialized=true;
document.body.classList.add("athlete-app");

const header=document.createElement("header");
header.className="athlete-shell-header";
header.innerHTML=`<div class="athlete-shell-header__inner"><button class="athlete-menu-button" type="button" aria-expanded="false" aria-controls="athleteDrawer"><span class="athlete-menu-button__icon" aria-hidden="true">☰</span><span>Menu</span></button><div class="athlete-shell-brand"><strong>Sandman Athlete</strong><span>Combat · Strength · Honor</span></div><button class="athlete-theme-button" data-athlete-theme type="button">Night</button></div>`;

const drawer=document.createElement("aside");
drawer.id="athleteDrawer";drawer.className="athlete-drawer";drawer.setAttribute("aria-label","Athlete navigation");drawer.setAttribute("aria-hidden","true");
drawer.innerHTML=`<div class="athlete-drawer__top"><div class="athlete-drawer__identity"><strong>Athlete Menu</strong><span>Your journey</span></div><button class="athlete-drawer-close" type="button" aria-label="Close menu">×</button></div><nav class="athlete-nav"><p class="athlete-nav__label">Athlete</p><div data-athlete-links></div><button class="athlete-nav__signout" type="button" data-athlete-signout>Sign Out</button></nav>`;

const backdrop=document.createElement("button");backdrop.type="button";backdrop.className="athlete-drawer-backdrop";backdrop.setAttribute("aria-label","Close Athlete navigation");backdrop.tabIndex=-1;
document.body.prepend(backdrop);document.body.prepend(drawer);document.body.prepend(header);

const footer=document.createElement("footer");footer.className="athlete-shell-footer";footer.textContent="Sandman System · Athlete Experience";document.body.append(footer);
applyTheme(localStorage.getItem(THEME_KEY) || "day");
const menu=header.querySelector(".athlete-menu-button");const closeButton=drawer.querySelector(".athlete-drawer-close");let returnFocus=null;
menu.disabled=true;
function openDrawer(){returnFocus=document.activeElement;drawer.classList.add("is-open");backdrop.classList.add("is-open");drawer.setAttribute("aria-hidden","false");menu.setAttribute("aria-expanded","true");document.documentElement.classList.add("athlete-drawer-open");closeButton.focus()}
function closeDrawer(){drawer.classList.remove("is-open");backdrop.classList.remove("is-open");drawer.setAttribute("aria-hidden","true");menu.setAttribute("aria-expanded","false");document.documentElement.classList.remove("athlete-drawer-open");if(returnFocus instanceof HTMLElement)returnFocus.focus()}
menu.addEventListener("click",openDrawer);closeButton.addEventListener("click",closeDrawer);backdrop.addEventListener("click",closeDrawer);
// Drawer links are inserted only after authenticated ownership resolution.
document.addEventListener("keydown",(event)=>{if(event.key==="Escape"&&drawer.classList.contains("is-open"))closeDrawer();if(event.key==="Tab"&&drawer.classList.contains("is-open")){const focusable=[...drawer.querySelectorAll('a,button:not([disabled])')];const first=focusable[0],last=focusable.at(-1);if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus()}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus()}}});
header.querySelector("[data-athlete-theme]").addEventListener("click",()=>applyTheme(document.documentElement.dataset.athleteTheme==="night"?"day":"night"));
drawer.querySelector("[data-athlete-signout]").addEventListener("click",async()=>{try{await signOut(auth)}finally{ID_KEYS.forEach((key)=>localStorage.removeItem(key));sessionStorage.removeItem("currentAthleteId");location.replace("/athletes/auth/")}});
async function hydrateNavigation(){
  const reportedId = athleteId();
  try {
    const resolved = await resolveSignedInAthlete(reportedId);
    if(!resolved.athleteId || !resolved.athlete){
      clearUnverifiedAthleteId();
      location.replace("/athletes/auth/");
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
    links.innerHTML=items.map(([label,path,kind])=>`<a class="${kind?"athlete-nav__child":""}" href="${route(path)}" ${active(path)&&kind!=="child-secondary"?'aria-current="page"':""}>${label}</a>`).join("");
    links.querySelectorAll("a").forEach(link=>link.addEventListener("click",closeDrawer));
    menu.disabled=false;

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
    clearUnverifiedAthleteId();
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
