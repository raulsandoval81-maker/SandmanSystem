#!/usr/bin/env python3

from pathlib import Path
from datetime import datetime
import re
import sys


ROOT = Path(__file__).resolve().parent
PUBLIC = ROOT / "public"

CSS_FILE = PUBLIC / "assets/css/password-toggle.css"
JS_FILE = PUBLIC / "assets/js/password-toggle.js"

LOGIN_FILES = [
    PUBLIC / "athletes/auth/index.html",
    PUBLIC / "coaches/auth/login.html",
    PUBLIC / "parent/auth.html",
    PUBLIC / "management/auth/index.html",
    PUBLIC / "admin/auth/login.html",
]

CSS_LINK = '<link rel="stylesheet" href="/assets/css/password-toggle.css">'
JS_SCRIPT = '<script src="/assets/js/password-toggle.js" defer></script>'

TIMESTAMP = datetime.now().strftime("%Y%m%d-%H%M%S")


CSS_CONTENT = """\
/* Shared Sandman password visibility control */

.password-field,
.password-control,
.password-input-wrap {
  position: relative;
}

.password-field input[type="password"],
.password-field input[data-password-input],
.password-control input[type="password"],
.password-control input[data-password-input],
.password-input-wrap input[type="password"],
.password-input-wrap input[data-password-input] {
  padding-right: 3.25rem;
}

.password-toggle {
  position: absolute;
  top: 50%;
  right: 0.65rem;
  transform: translateY(-50%);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2.25rem;
  height: 2.25rem;
  padding: 0;
  border: 0;
  border-radius: 0.5rem;
  background: transparent;
  color: inherit;
  cursor: pointer;
  opacity: 0.78;
  z-index: 2;
}

.password-toggle:hover {
  opacity: 1;
  background: rgba(127, 127, 127, 0.14);
}

.password-toggle:focus-visible {
  outline: 2px solid currentColor;
  outline-offset: 2px;
}

.password-toggle__icon {
  width: 1.25rem;
  height: 1.25rem;
  pointer-events: none;
}

.password-toggle__label {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
"""


JS_CONTENT = r"""\
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
"""


def backup_file(path: Path) -> Path:
    backup = path.with_name(
        f"{path.name}.before-password-toggle-{TIMESTAMP}"
    )
    backup.write_text(
        path.read_text(encoding="utf-8"),
        encoding="utf-8"
    )
    return backup


def inject_css(html: str) -> tuple[str, bool]:
    if "/assets/css/password-toggle.css" in html:
        return html, False

    if re.search(r"</head\s*>", html, flags=re.IGNORECASE):
        html = re.sub(
            r"</head\s*>",
            f"  {CSS_LINK}\n</head>",
            html,
            count=1,
            flags=re.IGNORECASE,
        )
        return html, True

    raise ValueError("No closing </head> tag found")


def inject_js(html: str) -> tuple[str, bool]:
    if "/assets/js/password-toggle.js" in html:
        return html, False

    if re.search(r"</body\s*>", html, flags=re.IGNORECASE):
        html = re.sub(
            r"</body\s*>",
            f"  {JS_SCRIPT}\n</body>",
            html,
            count=1,
            flags=re.IGNORECASE,
        )
        return html, True

    raise ValueError("No closing </body> tag found")


def patch_login_file(path: Path) -> None:
    if not path.exists():
        print(f"⚠️  Missing: {path.relative_to(ROOT)}")
        return

    original = path.read_text(encoding="utf-8")

    if not re.search(
        r'<input\b[^>]*type\s*=\s*["\']password["\']',
        original,
        flags=re.IGNORECASE,
    ):
        print(
            f"⚠️  No password input found: "
            f"{path.relative_to(ROOT)}"
        )
        return

    updated, css_added = inject_css(original)
    updated, js_added = inject_js(updated)

    if updated == original:
        print(
            f"✓ Already installed: "
            f"{path.relative_to(ROOT)}"
        )
        return

    backup = backup_file(path)
    path.write_text(updated, encoding="utf-8")

    print(f"✅ Patched: {path.relative_to(ROOT)}")
    print(f"   Backup: {backup.relative_to(ROOT)}")
    print(f"   CSS added: {css_added}")
    print(f"   JS added:  {js_added}")


def main() -> int:
    if not PUBLIC.exists():
        print(
            f"❌ Public directory not found: {PUBLIC}",
            file=sys.stderr,
        )
        return 1

    CSS_FILE.parent.mkdir(parents=True, exist_ok=True)
    JS_FILE.parent.mkdir(parents=True, exist_ok=True)

    CSS_FILE.write_text(CSS_CONTENT, encoding="utf-8")
    JS_FILE.write_text(JS_CONTENT, encoding="utf-8")

    print(
        f"✅ Created: {CSS_FILE.relative_to(ROOT)}"
    )
    print(
        f"✅ Created: {JS_FILE.relative_to(ROOT)}"
    )
    print()

    for login_file in LOGIN_FILES:
        try:
            patch_login_file(login_file)
        except Exception as error:
            print(
                f"❌ Failed: {login_file.relative_to(ROOT)}"
            )
            print(f"   {error}")

    print()
    print("Password-toggle installation complete.")
    print()
    print("Next checks:")
    print(
        "  grep -Rni \"password-toggle\" "
        "public/{athletes,coaches,parent,management,admin} "
        "| head -50"
    )
    print(
        "  node --check public/assets/js/password-toggle.js"
    )

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
