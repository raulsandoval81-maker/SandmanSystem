
(() => {

  function makeButton(text, className, href = null) {
    if (href) {
      const a = document.createElement("a");
      a.href = href;
      a.className = className;
      a.textContent = text;
      return a;
    }

    const button = document.createElement("button");
    button.type = "button";
    button.className = className;
    button.textContent = text;
    return button;
  }


  function makeTabs(card, activateLabel = "Activate") {

    if (card.querySelector(".tabs")) {
      return card.querySelector(".tabs");
    }

    const tabs = document.createElement("div");

    tabs.className = "tabs";
    tabs.setAttribute("role", "tablist");

    tabs.innerHTML = `
      <button
        class="tab-btn is-active"
        type="button"
        role="tab"
        aria-selected="true"
        data-auth-tab="login"
      >
        Login
      </button>

      <button
        class="tab-btn"
        type="button"
        role="tab"
        aria-selected="false"
        data-auth-tab="activate"
      >
        ${activateLabel}
      </button>
    `;

    const sub = card.querySelector(".sub");

    if (sub) {
      sub.insertAdjacentElement("afterend", tabs);
    }

    return tabs;
  }


  function makeQuickActions(card) {

    let quick = card.querySelector(".auth-quick-actions");

    if (quick) return quick;

    quick = document.createElement("div");
    quick.className = "actions auth-quick-actions";

    const tabs = card.querySelector(".tabs");
    const remember = card.querySelector(".remember-row");

    if (remember) {
      remember.insertAdjacentElement("afterend", quick);
    }
    else if (tabs) {
      tabs.insertAdjacentElement("afterend", quick);
    }

    return quick;
  }


  function normalizeAthlete(card) {

    const tabs = card.querySelector(".tabs");
    const loginPanel = card.querySelector("#panelLogin");
    const activatePanel = card.querySelector("#panelActivate");
    const remember = card.querySelector(".remember-row");
    const forgot = card.querySelector("#forgotPasswordBtn");
    const first = card.querySelector(".first-time-access");

    if (!tabs || !loginPanel) return;

    /*
     * Parent-style sequence:
     *
     * tabs
     * remember
     * recovery / activation
     * login panel
     */

    if (remember) {
      tabs.insertAdjacentElement("afterend", remember);
    }

    const quick = makeQuickActions(card);

    if (forgot) {
      quick.appendChild(forgot);
    }

    if (first) {
      quick.appendChild(first);
    }

    const loginActions = loginPanel.querySelector(".actions");

    if (
      loginActions &&
      !loginActions.querySelector(".auth-back-link")
    ) {
      loginActions.appendChild(
        makeButton(
          "Back",
          "btn-secondary auth-back-link",
          "/login/"
        )
      );
    }

    if (activatePanel) {
      activatePanel.classList.add("auth-activation-panel");
    }
  }


  function normalizeStaff(
    card,
    role,
    activateLabel,
    activationDescription
  ) {

    const email = card.querySelector("#email");
    const password = card.querySelector("#password");
    const remember = card.querySelector(".remember-row");
    const loginBtn = card.querySelector("#loginBtn");
    const resetBtn = card.querySelector("#resetBtn");
    const first = card.querySelector(".first-time-access");

    if (!email || !password || !loginBtn) return;

    const tabs = makeTabs(card, activateLabel);

    /*
     * Move remember row directly below tabs
     * just like Parent.
     */

    if (remember) {
      tabs.insertAdjacentElement(
        "afterend",
        remember
      );
    }

    /*
     * Parent-style quick actions.
     */

    const quick = makeQuickActions(card);

    if (resetBtn) {
      resetBtn.classList.add("btn-secondary");
      quick.appendChild(resetBtn);
    }

    if (first) {

      const link =
        first.querySelector(
          ".first-time-access__link"
        );

      if (link) {

        const shortcut = link.cloneNode(true);

        shortcut.classList.add(
          "auth-activation-shortcut"
        );

        const shell = document.createElement("div");
        shell.className = "first-time-access";

        shell.appendChild(shortcut);
        quick.appendChild(shell);
      }
    }

    /*
     * Build Parent-style login panel around
     * the EXISTING fields/buttons.
     *
     * Moving DOM elements does not destroy
     * their IDs or event listeners.
     */

    let loginPanel =
      card.querySelector("#panelLogin");

    if (!loginPanel) {

      loginPanel =
        document.createElement("section");

      loginPanel.id = "panelLogin";
      loginPanel.className =
        "panel is-active auth-generated-panel";

      const formShell =
        document.createElement("div");

      formShell.className =
        "auth-generated-form";

      const emailLabel =
        email.previousElementSibling;

      const passwordLabel =
        password.previousElementSibling;

      if (
        emailLabel &&
        emailLabel.tagName === "LABEL"
      ) {
        formShell.appendChild(emailLabel);
      }

      formShell.appendChild(email);

      if (
        passwordLabel &&
        passwordLabel.tagName === "LABEL"
      ) {
        formShell.appendChild(passwordLabel);
      }

      formShell.appendChild(password);

      const actions =
        document.createElement("div");

      actions.className = "actions";

      loginBtn.classList.add("btn-primary");

      actions.appendChild(loginBtn);

      actions.appendChild(
        makeButton(
          "Back",
          "btn-secondary auth-back-link",
          "/login/"
        )
      );

      formShell.appendChild(actions);
      loginPanel.appendChild(formShell);

      quick.insertAdjacentElement(
        "afterend",
        loginPanel
      );
    }

    /*
     * Build activation panel.
     */

    let activatePanel =
      card.querySelector("#panelActivate");

    if (!activatePanel) {

      activatePanel =
        document.createElement("section");

      activatePanel.id = "panelActivate";
      activatePanel.className =
        "panel auth-activation-panel";

      const description =
        document.createElement("p");

      description.className = "sub";
      description.textContent =
        activationDescription;

      activatePanel.appendChild(description);

      if (first) {
        activatePanel.appendChild(first);
      }

      const actions =
        document.createElement("div");

      actions.className = "actions";

      actions.appendChild(
        makeButton(
          "Back",
          "btn-secondary auth-back-link",
          "/login/"
        )
      );

      activatePanel.appendChild(actions);

      loginPanel.insertAdjacentElement(
        "afterend",
        activatePanel
      );
    }

    /*
     * Hide old staff-specific cross-role
     * navigation. /login/ is now canonical.
     */

    card
      .querySelectorAll(".back-link")
      .forEach(link => {
        link.hidden = true;
      });


    /*
     * Tab behavior.
     */

    tabs
      .querySelectorAll("[data-auth-tab]")
      .forEach(button => {

        button.addEventListener(
          "click",
          () => {

            const target =
              button.dataset.authTab;

            tabs
              .querySelectorAll(
                "[data-auth-tab]"
              )
              .forEach(tab => {

                const active =
                  tab === button;

                tab.classList.toggle(
                  "is-active",
                  active
                );

                tab.setAttribute(
                  "aria-selected",
                  String(active)
                );
              });

            loginPanel.classList.toggle(
              "is-active",
              target === "login"
            );

            activatePanel.classList.toggle(
              "is-active",
              target === "activate"
            );
          }
        );
      });
  }


  document.addEventListener(
    "DOMContentLoaded",
    () => {

      const card =
        document.querySelector("main.card");

      if (!card) return;

      const path =
        window.location.pathname;

      if (
        path.startsWith(
          "/athletes/auth"
        )
      ) {
        normalizeAthlete(card);
        return;
      }

      if (
        path.startsWith(
          "/coaches/auth"
        )
      ) {
        normalizeStaff(
          card,
          "coach",
          "Activate",
          "Coach access is activated through an approved Sandman invitation."
        );

        return;
      }

      if (
        path.startsWith(
          "/management/auth"
        )
      ) {
        normalizeStaff(
          card,
          "management",
          "Activate",
          "Management access is available only to approved Sandman management accounts."
        );
      }
    }
  );

})();
