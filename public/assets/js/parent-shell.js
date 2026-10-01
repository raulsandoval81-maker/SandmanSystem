const langBtns = document.querySelectorAll(".lang-btn");
const themeBtns = document.querySelectorAll(".theme-btn");
const toggle = document.getElementById("themeToggle");

function setLang(lang) {
  const normalized =
    lang === "sp"
      ? "es"
      : (lang || "en");

  const isSpanish =
    normalized === "es";

  localStorage.setItem(
    "lang",
    normalized
  );

  document.body.classList.toggle(
    "lang-es",
    isSpanish
  );

  langBtns.forEach((btn) => {
    const btnLang =
      btn.dataset.lang === "sp"
        ? "es"
        : btn.dataset.lang;

    btn.classList.toggle(
      "active",
      btnLang === normalized
    );
  });

  document
    .querySelectorAll(".en")
    .forEach((el) => {
      el.style.display =
        isSpanish ? "none" : "";
    });

  document
    .querySelectorAll(".es")
    .forEach((el) => {
      el.style.display =
        isSpanish ? "" : "none";
    });

  document
    .querySelectorAll(
      "[data-placeholder-en], [data-placeholder-es]"
    )
    .forEach((el) => {
      const placeholder =
        isSpanish
          ? el.dataset.placeholderEs
          : el.dataset.placeholderEn;

      if (placeholder) {
        el.setAttribute(
          "placeholder",
          placeholder
        );
      }
    });

  document.documentElement.lang =
    isSpanish ? "es" : "en";
}

function setTheme(theme) {
  const normalized =
    theme === "day"
      ? "day"
      : "night";

  const isDay =
    normalized === "day";

  localStorage.setItem(
    "parent-theme",
    normalized
  );

  document.body.classList.toggle(
    "day",
    isDay
  );

  document.body.classList.toggle(
    "day-mode",
    isDay
  );

  document.body.classList.toggle(
    "theme-day",
    isDay
  );

  document.body.classList.toggle(
    "theme-night",
    !isDay
  );

  themeBtns.forEach((btn) => {
    btn.classList.toggle(
      "active",
      btn.dataset.theme === normalized
    );
  });

  if (toggle) {
    toggle.textContent =
      isDay ? "🌙" : "☀️";
  }
}

function getParentAthleteUidFromUrl() {
  const params =
    new URLSearchParams(
      window.location.search
    );

  return String(
    params.get("uid") ||
    params.get("id") ||
    params.get("athleteUid") ||
    ""
  )
    .trim()
    .toUpperCase();
}

function wireParentTabsGlobal() {
  const athleteUid =
    getParentAthleteUidFromUrl();

  if (!athleteUid) return;

  document
    .querySelectorAll(
      ".hub-mark, .parent-tab, .parent-tabs a, .parent-subtabs a"
    )
    .forEach((a) => {
      const href =
        a.getAttribute("href");

      if (!href) return;

      const url =
        new URL(
          href,
          window.location.origin
        );

      url.searchParams.set(
        "uid",
        athleteUid
      );

      a.setAttribute(
        "href",
        url.pathname + url.search
      );
    });
}

function moveParentMethodBelowDashboard() {
  const method = document.querySelector("main.wrap > .parent-method");
  const priorityGrid = document.querySelector("main.wrap > .family-priority-grid");

  if (!method || !priorityGrid) return;

  priorityGrid.insertAdjacentElement("afterend", method);
}

function polishFamilySnapshot() {
  const snapshot = document.querySelector(".family-snapshot");
  const list = document.querySelector(".family-athlete-list");
  if (!snapshot || !list) return;

  snapshot.classList.add("family-snapshot-premium");

  const oldTopAction = snapshot.querySelector(".section-head > .back-btn");
  if (oldTopAction) oldTopAction.style.display = "none";

  if (!document.getElementById("familySnapshotPremiumStyles")) {
    const style = document.createElement("style");
    style.id = "familySnapshotPremiumStyles";
    style.textContent = `
      .family-snapshot-premium{
        position:relative;
        overflow:hidden;
        padding:22px;
      }

      .family-snapshot-premium::before{
        content:"";
        position:absolute;
        inset:0 0 auto 0;
        height:3px;
        background:var(--gold);
        opacity:.9;
      }

      .family-snapshot-premium .section-head{
        margin-bottom:16px;
      }

      .family-snapshot-premium .family-athlete-list{
        display:grid;
        grid-template-columns:repeat(auto-fit,minmax(220px,1fr));
        gap:12px;
      }

      .family-snapshot-premium .family-athlete-chip{
        position:relative;
        min-height:104px;
        padding:18px 48px 18px 62px;
        display:flex;
        align-items:center;
        border:1px solid var(--line);
        border-radius:16px;
        background:linear-gradient(145deg,var(--panel-soft),var(--panel));
        color:var(--text);
        font-size:1.02rem;
        font-weight:900;
        line-height:1.25;
        text-decoration:none;
        box-shadow:0 8px 20px rgba(0,0,0,.10);
        transition:transform .16s ease,border-color .16s ease,box-shadow .16s ease;
      }

      .family-snapshot-premium .family-athlete-chip::before{
        content:var(--athlete-initial,"A");
        position:absolute;
        left:18px;
        top:50%;
        width:32px;
        height:32px;
        transform:translateY(-50%);
        display:flex;
        align-items:center;
        justify-content:center;
        border-radius:50%;
        background:var(--gold);
        color:#111;
        font-size:.85rem;
        font-weight:950;
        box-shadow:0 0 0 5px rgba(209,174,63,.12);
      }

      .family-snapshot-premium .family-athlete-chip::after{
        content:"View progress →";
        position:absolute;
        right:16px;
        bottom:14px;
        color:var(--gold);
        font-size:.72rem;
        font-weight:900;
        letter-spacing:.02em;
      }

      .family-snapshot-premium .family-athlete-chip:hover,
      .family-snapshot-premium .family-athlete-chip:focus-visible{
        border-color:var(--gold);
        transform:translateY(-2px);
        box-shadow:0 12px 26px rgba(0,0,0,.14);
        outline:none;
      }

      .family-snapshot-premium .family-athlete-list:has(.family-athlete-chip:only-child) .family-athlete-chip{
        max-width:none;
      }

      @media(max-width:560px){
        .family-snapshot-premium{
          padding:18px;
        }

        .family-snapshot-premium .family-athlete-list{
          grid-template-columns:1fr;
        }

        .family-snapshot-premium .family-athlete-chip{
          min-height:94px;
        }
      }
    `;
    document.head.appendChild(style);
  }

  const decorate = () => {
    list.querySelectorAll(".family-athlete-chip").forEach((chip) => {
      const name = String(chip.textContent || "Athlete").trim();
      const initial = name.charAt(0).toUpperCase() || "A";
      chip.style.setProperty("--athlete-initial", `"${initial}"`);
      chip.setAttribute("aria-label", `View ${name}'s progress`);
    });
  };

  decorate();

  const observer = new MutationObserver(decorate);
  observer.observe(list, { childList:true });
}

function ensureParentFooter() {
  if (document.querySelector(".parent-system-footer")) return;

  const footer = document.createElement("footer");
  footer.className = "parent-system-footer";
  footer.innerHTML = `
    <div class="parent-system-footer__inner">
      <span>Sandman System™ • Parent Communications</span>
    </div>
  `;

  document.body.appendChild(footer);
}

function initParentShell() {
  langBtns.forEach((btn) => {
    btn.addEventListener(
      "click",
      () => setLang(btn.dataset.lang)
    );
  });

  themeBtns.forEach((btn) => {
    btn.addEventListener(
      "click",
      () => setTheme(btn.dataset.theme)
    );
  });

  toggle?.addEventListener(
    "click",
    () => {
      const isDay =
        document.body.classList.contains(
          "day"
        );

      setTheme(
        isDay ? "night" : "day"
      );
    }
  );

  setLang(
    localStorage.getItem("lang") ||
    "en"
  );

  setTheme(
    localStorage.getItem(
      "parent-theme"
    ) ||
    "day"
  );

  wireParentTabsGlobal();
  moveParentMethodBelowDashboard();
  polishFamilySnapshot();
  ensureParentFooter();
}

document.addEventListener(
  "DOMContentLoaded",
  initParentShell
);

async function initMemberExperience() {
  const preferences = await import("/assets/js/parent-preferences.js");
  const navigation = await import("/assets/js/parent-nav.js");
  preferences.setParentLanguage(localStorage.getItem("lang") || "en");
  preferences.setParentTheme(localStorage.getItem("parent-theme") || localStorage.getItem("theme") || "day");
  navigation.initParentNavigation();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => void initMemberExperience());
} else {
  void initMemberExperience();
}
