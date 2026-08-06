(() => {
  const EYE_OPEN = `
    <svg
      class="password-toggle__icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12"></path>
      <circle cx="12" cy="12" r="3"></circle>
    </svg>
  `;

  const EYE_CLOSED = `
    <svg
      class="password-toggle__icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <path d="M3 3l18 18"></path>
      <path d="M10.6 10.6a2 2 0 0 0 2.8 2.8"></path>
      <path d="M9.9 4.2A10.8 10.8 0 0 1 12 4c6.5 0 10 8 10 8a18.8 18.8 0 0 1-2.1 3.2"></path>
      <path d="M6.6 6.6C3.7 8.5 2 12 2 12s3.5 8 10 8a10.1 10.1 0 0 0 4.1-.9"></path>
    </svg>
  `;

  function findPasswordInputs(root = document) {
    return Array.from(
      root.querySelectorAll(
        'input[type="password"], input[data-password-input]'
      )
    );
  }

  function createToggle(input, index) {
    if (input.dataset.passwordToggleReady === "true") {
      return;
    }

    input.dataset.passwordToggleReady = "true";
    input.setAttribute("data-password-input", "");

    if (!input.id) {
      input.id = `password-field-${index + 1}`;
    }

    let wrapper = input.parentElement;

    if (
      !wrapper ||
      !wrapper.classList.contains("password-control")
    ) {
      wrapper = document.createElement("div");
      wrapper.className = "password-control";

      input.parentNode.insertBefore(wrapper, input);
      wrapper.appendChild(input);
    }

    const existingToggle = wrapper.querySelector("[data-password-toggle]");

    if (existingToggle) {
      return;
    }

    const button = document.createElement("button");
    button.type = "button";
    button.className = "password-toggle";
    button.setAttribute("data-password-toggle", "");
    button.setAttribute("aria-label", "Show password");
    button.setAttribute("aria-pressed", "false");
    button.setAttribute("aria-controls", input.id);

    button.innerHTML = `
      ${EYE_OPEN}
      <span class="password-toggle__label">Show password</span>
    `;

    button.addEventListener("click", () => {
      const shouldShow = input.type === "password";

      input.type = shouldShow ? "text" : "password";

      const label = shouldShow
        ? "Hide password"
        : "Show password";

      button.setAttribute("aria-label", label);
      button.setAttribute(
        "aria-pressed",
        String(shouldShow)
      );

      button.innerHTML = `
        ${shouldShow ? EYE_CLOSED : EYE_OPEN}
        <span class="password-toggle__label">${label}</span>
      `;

      input.focus({
        preventScroll: true
      });

      const length = input.value.length;

      try {
        input.setSelectionRange(length, length);
      } catch {
        // Some input types or browsers may not support selection ranges.
      }
    });

    wrapper.appendChild(button);
  }

  function initializePasswordToggles(root = document) {
    findPasswordInputs(root).forEach(createToggle);
  }

  if (document.readyState === "loading") {
    document.addEventListener(
      "DOMContentLoaded",
      () => initializePasswordToggles()
    );
  } else {
    initializePasswordToggles();
  }

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (!(node instanceof Element)) {
          continue;
        }

        if (
          node.matches?.(
            'input[type="password"], input[data-password-input]'
          )
        ) {
          initializePasswordToggles(node.parentElement || document);
          continue;
        }

        if (
          node.querySelector?.(
            'input[type="password"], input[data-password-input]'
          )
        ) {
          initializePasswordToggles(node);
        }
      }
    }
  });

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true
  });
})();
