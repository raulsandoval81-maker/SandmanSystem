import { auth } from "/assets/js/firebase-init.js";
import { signOut } from "https://www.gstatic.com/firebasejs/10.13.1/firebase-auth.js";

const THEME_KEY = "sandman-athlete-theme";
const ID_KEYS = ["sandman_lastAthleteUid", "currentAthleteId"];
const params = new URLSearchParams(location.search);

function athleteId(){
  return String(params.get("id") || params.get("athleteId") || params.get("uid") || ID_KEYS.map((key)=>localStorage.getItem(key)).find(Boolean) || sessionStorage.getItem("currentAthleteId") || "").trim().toUpperCase();
}

const id = athleteId();
if(id){
  localStorage.setItem("sandman_lastAthleteUid",id);
  localStorage.setItem("currentAthleteId",id);
  sessionStorage.setItem("currentAthleteId",id);
}

function route(path){
  const next = new URLSearchParams(params);
  ["uid","athleteId"].forEach((key)=>next.delete(key));
  if(id) next.set("id",id);
  const query = next.toString();
  return `${path}${query ? `?${query}` : ""}`;
}

const items = [
  ["Home", "/athletes/hub/"],
  ["My Progress", "/athletes/profile/"],
  ["Arsenal", "/athletes/arsenal/"],
  ["Schedule", "/communications/athlete/schedule.html"],
  ["Communications", "/communications/athlete/"],
  ["Announcements", "/athletes/bulletin/announcements.html", "child"],
  ["Schedule", "/communications/athlete/schedule.html", "child-secondary"],
  ["Leaderboard", "/athletes/leaderboard/"]
];

function active(path){
  const here=location.pathname;
  if(path==="/athletes/hub/") return here.startsWith("/athletes/hub/");
  if(path==="/communications/athlete/") return here==="/communications/athlete/" || here.endsWith("/communications/athlete/index.html");
  if(path.includes("announcements")) return here.includes("announcements");
  if(path.includes("schedule")) return here.includes("schedule");
  return here.startsWith(path);
}

function applyTheme(theme){
  const value=theme==="night"?"night":"day";
  document.documentElement.dataset.athleteTheme=value;
  localStorage.setItem(THEME_KEY,value);
  const button=document.querySelector("[data-athlete-theme]");
  if(button){button.textContent=value==="night"?"Day":"Night";button.setAttribute("aria-label",`Switch to ${value==="night"?"Day":"Night"} appearance`)}
}

let shellInitialized=false;
function initializeAthleteShell(){
if(shellInitialized || !document.body) return;
shellInitialized=true;
applyTheme(localStorage.getItem(THEME_KEY) || "day");
document.body.classList.add("athlete-app");

const header=document.createElement("header");
header.className="athlete-shell-header";
header.innerHTML=`<div class="athlete-shell-header__inner"><button class="athlete-menu-button" type="button" aria-expanded="false" aria-controls="athleteDrawer"><span class="athlete-menu-button__icon" aria-hidden="true">☰</span><span>Menu</span></button><div class="athlete-shell-brand"><strong>Sandman Athlete</strong><span>Combat · Strength · Honor</span></div><button class="athlete-theme-button" data-athlete-theme type="button">Night</button></div>`;

const drawer=document.createElement("aside");
drawer.id="athleteDrawer";drawer.className="athlete-drawer";drawer.setAttribute("aria-label","Athlete navigation");drawer.setAttribute("aria-hidden","true");
drawer.innerHTML=`<div class="athlete-drawer__top"><div class="athlete-drawer__identity"><strong>Athlete Menu</strong><span>Your journey</span></div><button class="athlete-drawer-close" type="button" aria-label="Close menu">×</button></div><nav class="athlete-nav"><p class="athlete-nav__label">Athlete</p>${items.map(([label,path,kind])=>`<a class="${kind?"athlete-nav__child":""}" href="${route(path)}" ${active(path)&&kind!=="child-secondary"?'aria-current="page"':""}>${label}</a>`).join("")}<button class="athlete-nav__signout" type="button" data-athlete-signout>Sign Out</button></nav>`;

const backdrop=document.createElement("button");backdrop.type="button";backdrop.className="athlete-drawer-backdrop";backdrop.setAttribute("aria-label","Close Athlete navigation");backdrop.tabIndex=-1;
document.body.prepend(backdrop);document.body.prepend(drawer);document.body.prepend(header);

const footer=document.createElement("footer");footer.className="athlete-shell-footer";footer.textContent="Sandman System · Athlete Experience";document.body.append(footer);
const menu=header.querySelector(".athlete-menu-button");const closeButton=drawer.querySelector(".athlete-drawer-close");let returnFocus=null;
function openDrawer(){returnFocus=document.activeElement;drawer.classList.add("is-open");backdrop.classList.add("is-open");drawer.setAttribute("aria-hidden","false");menu.setAttribute("aria-expanded","true");document.documentElement.classList.add("athlete-drawer-open");closeButton.focus()}
function closeDrawer(){drawer.classList.remove("is-open");backdrop.classList.remove("is-open");drawer.setAttribute("aria-hidden","true");menu.setAttribute("aria-expanded","false");document.documentElement.classList.remove("athlete-drawer-open");if(returnFocus instanceof HTMLElement)returnFocus.focus()}
menu.addEventListener("click",openDrawer);closeButton.addEventListener("click",closeDrawer);backdrop.addEventListener("click",closeDrawer);
drawer.querySelectorAll("a").forEach((link)=>link.addEventListener("click",closeDrawer));
document.addEventListener("keydown",(event)=>{if(event.key==="Escape"&&drawer.classList.contains("is-open"))closeDrawer();if(event.key==="Tab"&&drawer.classList.contains("is-open")){const focusable=[...drawer.querySelectorAll('a,button:not([disabled])')];const first=focusable[0],last=focusable.at(-1);if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus()}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus()}}});
header.querySelector("[data-athlete-theme]").addEventListener("click",()=>applyTheme(document.documentElement.dataset.athleteTheme==="night"?"day":"night"));
drawer.querySelector("[data-athlete-signout]").addEventListener("click",async()=>{try{await signOut(auth)}finally{ID_KEYS.forEach((key)=>localStorage.removeItem(key));sessionStorage.removeItem("currentAthleteId");location.replace("/athletes/auth/")}});
}

if(!document.body || document.readyState==="loading"){
  document.addEventListener("DOMContentLoaded",initializeAthleteShell,{once:true});
  setTimeout(initializeAthleteShell,0);
}else{
  initializeAthleteShell();
}
