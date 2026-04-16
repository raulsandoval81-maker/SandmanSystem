// /coach/shared/toolbar.js
// Final: tiny EN/SP pill on parent pages, full toolbar on coach pages.

const toolbar = document.createElement("div");
// ------------------------------------------
// NEW TOOLBAR FLAG LOGIC (v1)
// ------------------------------------------

const hideNav       = window.TOOLBAR_HIDE_NAV === true;
const hideLang      = window.TOOLBAR_HIDE_LANGUAGE === true;
const parentMode    = window.TOOLBAR_PARENT_MODE === true;
const coachMode     = window.TOOLBAR_COACH_MODE === true;
const simpleMode    = window.TOOLBAR_SIMPLE === true;

// Simple mode → toolbar shows only title (no nav, no lang)
if (simpleMode) {
  hideNav  = true;
  hideLang = true;
  toolbar.classList.add("toolbar-simple");
}

// Parent / Coach theme flags
if (parentMode) toolbar.classList.add("toolbar-parent");
if (coachMode)  toolbar.classList.add("toolbar-coach");

toolbar.className = "coach-toolbar";

// BRAND
const brand = document.createElement("div");
brand.className = "brand-title";
brand.textContent = "Lompoc HS Wrestling";
toolbar.appendChild(brand);

// NAV (only used on coach pages by default)
const nav = document.createElement("nav");
nav.className = "toolbar-nav";

// LANG TOGGLE
const langWrap = document.createElement("div");
langWrap.className = "lang-wrap";

const enBtn = document.createElement("button");
enBtn.textContent = "EN";
enBtn.className = "lang-btn";

const spBtn = document.createElement("button");
spBtn.textContent = "SP"; // label = SP (Spanish)
spBtn.className = "lang-btn";

langWrap.appendChild(enBtn);
langWrap.appendChild(spBtn);
if (window.TOOLBAR_HIDE_LANGUAGE) {
  document.querySelector(".toolbar-lang")?.remove();
}

toolbar.appendChild(langWrap);

// Detect parent-facing pages (works on localhost /public/... and hosting /coach/...)
const path = window.location.pathname || "";

const isParentPage =
  path.includes("/para/") ||           // Para-Comms pages
  path.includes("/coach/meeting/") ||        // Parent meeting portal
  path.includes("/coach/parent-landing") ||  // QR parent landing page
  path.includes("/coach/parent/");           // any future /coach/parent/... pages

  
// Add a class so CSS can treat parents differently
if (isParentPage) {
  toolbar.classList.add("parent-toolbar");
}

document.body.prepend(toolbar);

/* -----------------------------
   LANGUAGE LOGIC (en / es)
------------------------------*/
function setLang(L) {
  localStorage.setItem("lang", L);
  window.__lang = L;

  enBtn.classList.toggle("active", L === "en");
  spBtn.classList.toggle("active", L === "es");

  if (window.onToolbarLang) window.onToolbarLang(L);
}

enBtn.onclick = () => setLang("en");
spBtn.onclick = () => setLang("es");

// default from storage (or EN)
setLang(localStorage.getItem("lang") || "en");

/* -----------------------------
   CONDITIONAL NAV (COACH TOP BAR)
------------------------------*/
if (!isParentPage && Array.isArray(window.NAV)) {
  window.NAV.forEach(([href, label]) => {
    const a = document.createElement("a");
    a.href = href;
    a.textContent = label;
    nav.appendChild(a);
  });
  toolbar.insertBefore(nav, langWrap);
}

/* -----------------------------
   PARENT FOOTER NAV
------------------------------*/
if (isParentPage && Array.isArray(window.NAV)) {
  const footerNav = document.createElement("div");
  footerNav.className = "parent-footer-nav";

  window.NAV.forEach(([href, label]) => {
    const a = document.createElement("a");
    a.href = href;
    a.textContent = label;
    footerNav.appendChild(a);
  });

  // Try to drop it into #footer-slot if it exists, else at end of body
  const slot = document.getElementById("footer-slot");
  if (slot) {
    slot.appendChild(footerNav);
  } else {
    document.body.appendChild(footerNav);
  }
}

/* -----------------------------
   STYLE
------------------------------*/
const style = document.createElement("style");
style.textContent = `
  .coach-toolbar{
    width:100%;
    background:#0b255f;
    border-bottom:1px solid #1e3a8a;
    padding:10px 14px;
    color:#fff;
    display:flex;
    align-items:center;
    justify-content:space-between;
    gap:10px;
    position:sticky;
    top:0;
    z-index:600;
  }
  .brand-title{
    font-weight:700;
    font-size:1rem;
    color:#ffcc33;
    text-transform:uppercase;
    letter-spacing:.03em;
  }
  .toolbar-nav a{
    color:#fff;å
    margin-right:14px;
    text-decoration:none;
    font-size:.9rem;
  }
  .toolbar-nav a:hover{
    color:#ffcc33;
  }
  .lang-wrap{
    display:flex;
    gap:6px;
  }
  .lang-btn{
    padding:6px 10px;
    font-size:.8rem;
    border-radius:6px;
    background:#1e3a8a;
    border:none;
    color:#fff;
    cursor:pointer;
  }
  .lang-btn.active{
    background:#ffcc33;
    color:#000;
    font-weight:700;
  }

  /* Phone sizing general */
  @media (max-width:600px){
    .coach-toolbar{
      padding:8px 10px;
      flex-wrap:wrap;
    }
  }

  /* 🔹 Parent pages: shrink to tiny pill, no vertical push */
  .coach-toolbar.parent-toolbar{
    position:fixed;
    top:8px;
    right:8px;
    left:auto;
    width:auto;
    background:rgba(11,37,95,.85);
    border-radius:999px;
    padding:4px 6px;
    border:1px solid #1e3a8a;
    box-shadow:0 4px 10px rgba(0,0,0,.4);
    gap:4px;
  }
  .coach-toolbar.parent-toolbar .brand-title{
    display:none;
  }
  .coach-toolbar.parent-toolbar .toolbar-nav{
    display:none;
  }
  .coach-toolbar.parent-toolbar .lang-btn{
    padding:4px 8px;
    font-size:.75rem;
  }

  /* 🔻 Parent footer nav bar */
  .parent-footer-nav{
    max-width:1000px;
    margin:24px auto 10px;
    padding:10px 12px 4px;
    border-top:1px solid #27304a;
    display:flex;
    flex-wrap:wrap;
    justify-content:center;
    gap:8px;
    font-size:.85rem;
  }
  .parent-footer-nav a{
    padding:6px 10px;
    border-radius:999px;
    border:1px solid #27304a;
    background:#0c1428;
    color:#e5e7eb;
    text-decoration:none;
    white-space:nowrap;
  }
  .parent-footer-nav a:hover{
    background:#1d2a4a;
    border-color:#ffdd48;
    color:#fff;
  }
`;
document.head.appendChild(style);

// Debug marker so you know the new file is loaded
console.log("[toolbar] v3.3 loaded (EN/SP). Parent mode:", isParentPage);
