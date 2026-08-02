from pathlib import Path
import shutil
import sys
from datetime import datetime


HTML_FILE = Path("public/connect/interest/index.html")
JS_FILE = Path("public/connect/interest/interest.js")


def replace_once(text, old, new, label):
    count = text.count(old)

    if count != 1:
        raise RuntimeError(
            f"{label}: expected exactly one match, found {count}"
        )

    return text.replace(old, new, 1)


def backup(path):
    timestamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    backup_path = path.with_name(
        f"{path.name}.before-interest-type-{timestamp}"
    )

    shutil.copy2(path, backup_path)
    return backup_path


def update_html():
    if not HTML_FILE.exists():
        raise FileNotFoundError(
            f"Missing HTML file: {HTML_FILE}"
        )

    original = HTML_FILE.read_text(encoding="utf-8")
    updated = original

    # ---------------------------------------------------------
    # Add styles for the intake-path selector
    # ---------------------------------------------------------

    old_style_end = '''    .connect-footer a::before {
      content: "← ";
    }
  </style>'''

    new_style_end = '''    .connect-footer a::before {
      content: "← ";
    }

    .interest-type-grid {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 12px;
    }

    .interest-type-option {
      position: relative;
    }

    .interest-type-option input {
      position: absolute;
      opacity: 0;
      pointer-events: none;
    }

    .interest-type-card {
      display: flex;
      min-height: 104px;
      align-items: center;
      justify-content: center;
      border: 1px solid rgba(255, 255, 255, 0.18);
      border-radius: 14px;
      background: rgba(255, 255, 255, 0.04);
      cursor: pointer;
      padding: 18px 14px;
      text-align: center;
      transition:
        border-color 160ms ease,
        background 160ms ease,
        transform 160ms ease;
    }

    .interest-type-card:hover {
      transform: translateY(-1px);
      border-color: rgba(250, 204, 21, 0.55);
    }

    .interest-type-option input:checked +
    .interest-type-card {
      border-color: #facc15;
      background: rgba(250, 204, 21, 0.12);
      box-shadow: 0 0 0 1px rgba(250, 204, 21, 0.18);
    }

    .interest-type-title {
      display: block;
      font-weight: 800;
    }

    .interest-type-description {
      display: block;
      margin-top: 5px;
      font-size: 0.82rem;
      opacity: 0.72;
    }

    [hidden] {
      display: none !important;
    }

    @media (max-width: 680px) {
      .interest-type-grid {
        grid-template-columns: 1fr;
      }

      .interest-type-card {
        min-height: 86px;
      }
    }
  </style>'''

    if ".interest-type-grid" not in updated:
        updated = replace_once(
            updated,
            old_style_end,
            new_style_end,
            "interest selector styles"
        )

    # ---------------------------------------------------------
    # Add visible Combat / Fitness / Both selector
    # ---------------------------------------------------------

    old_form_start = '''        <input
          id="preferredLanguage"
          name="preferredLanguage"
          type="hidden"
          value="en"
        />

        <section class="form-section">
          <h2>
            <span data-lang="en">
              Parent or Guardian
            </span>'''

    new_form_start = '''        <input
          id="preferredLanguage"
          name="preferredLanguage"
          type="hidden"
          value="en"
        />

        <section class="form-section">
          <h2>
            <span data-lang="en">
              What Are You Looking For?
            </span>

            <span data-lang="es">
              ¿Qué Estás Buscando?
            </span>
          </h2>

          <div
            class="interest-type-grid"
            role="radiogroup"
            aria-label="Program category"
          >
            <label class="interest-type-option">
              <input
                type="radio"
                name="interestType"
                value="combat"
                checked
              />

              <span class="interest-type-card">
                <span>
                  <span class="interest-type-title">
                    <span data-lang="en">
                      Combat
                    </span>

                    <span data-lang="es">
                      Combate
                    </span>
                  </span>

                  <span class="interest-type-description">
                    <span data-lang="en">
                      Wrestling, boxing, Muay Thai, MMA, or grappling
                    </span>

                    <span data-lang="es">
                      Lucha, boxeo, Muay Thai, MMA o grappling
                    </span>
                  </span>
                </span>
              </span>
            </label>

            <label class="interest-type-option">
              <input
                type="radio"
                name="interestType"
                value="fitness"
              />

              <span class="interest-type-card">
                <span>
                  <span class="interest-type-title">
                    <span data-lang="en">
                      Fitness
                    </span>

                    <span data-lang="es">
                      Acondicionamiento
                    </span>
                  </span>

                  <span class="interest-type-description">
                    <span data-lang="en">
                      Youth fitness, strength, conditioning, or wellness
                    </span>

                    <span data-lang="es">
                      Fitness juvenil, fuerza, acondicionamiento o bienestar
                    </span>
                  </span>
                </span>
              </span>
            </label>

            <label class="interest-type-option">
              <input
                type="radio"
                name="interestType"
                value="both"
              />

              <span class="interest-type-card">
                <span>
                  <span class="interest-type-title">
                    <span data-lang="en">
                      Both
                    </span>

                    <span data-lang="es">
                      Ambos
                    </span>
                  </span>

                  <span class="interest-type-description">
                    <span data-lang="en">
                      Combat and fitness support
                    </span>

                    <span data-lang="es">
                      Apoyo de combate y acondicionamiento
                    </span>
                  </span>
                </span>
              </span>
            </label>
          </div>
        </section>

        <section class="form-section">
          <h2>
            <span data-lang="en">
              Parent or Guardian
            </span>'''

    if 'name="interestType"' not in updated:
        updated = replace_once(
            updated,
            old_form_start,
            new_form_start,
            "interest type selector"
        )

    # ---------------------------------------------------------
    # Give the program section an ID so JS can hide it
    # ---------------------------------------------------------

    old_program_section = '''        <section class="form-section">
          <h2>
            <span data-lang="en">
              Program Interest
            </span>'''

    new_program_section = '''        <section
          id="combatProgramSection"
          class="form-section"
        >
          <h2>
            <span data-lang="en">
              Combat Program Interest
            </span>'''

    if 'id="combatProgramSection"' not in updated:
        updated = replace_once(
            updated,
            old_program_section,
            new_program_section,
            "combat program section"
        )

    # ---------------------------------------------------------
    # Make visible HTML required state controlled by JS
    # ---------------------------------------------------------

    old_program_select = '''           <select
  id="programInterest"
  name="programInterest"
  required
>'''

    new_program_select = '''           <select
  id="programInterest"
  name="programInterest"
>'''

    if old_program_select in updated:
        updated = replace_once(
            updated,
            old_program_select,
            new_program_select,
            "program select required state"
        )

    # ---------------------------------------------------------
    # Repair stray closing div after shirt size
    # ---------------------------------------------------------

    old_shirt_end = '''  </select>
</div>

</div>
        </section>'''

    new_shirt_end = '''  </select>
</div>
        </section>'''

    if old_shirt_end in updated:
        updated = replace_once(
            updated,
            old_shirt_end,
            new_shirt_end,
            "stray shirt section closing tag"
        )

    # ---------------------------------------------------------
    # Repair stray closing section before form status
    # ---------------------------------------------------------

    old_form_bottom = '''        </section>
    </section>
        <div
          id="formStatus"'''

    new_form_bottom = '''        </section>

        <div
          id="formStatus"'''

    if old_form_bottom in updated:
        updated = replace_once(
            updated,
            old_form_bottom,
            new_form_bottom,
            "stray closing section before status"
        )

    if updated == original:
        print("HTML already updated.")
        return None

    backup_path = backup(HTML_FILE)
    HTML_FILE.write_text(updated, encoding="utf-8")

    print(f"Updated HTML: {HTML_FILE}")
    print(f"Backup HTML:  {backup_path}")

    return backup_path


def update_js():
    if not JS_FILE.exists():
        raise FileNotFoundError(
            f"Missing JS file: {JS_FILE}"
        )

    original = JS_FILE.read_text(encoding="utf-8")
    updated = original

    # ---------------------------------------------------------
    # Add element references
    # ---------------------------------------------------------

    old_program_reference = '''const programInterest =
  document.getElementById("programInterest");

const PROGRAMS = ['''

    new_program_reference = '''const programInterest =
  document.getElementById("programInterest");

const combatProgramSection =
  document.getElementById("combatProgramSection");

const interestTypeInputs =
  Array.from(
    document.querySelectorAll(
      'input[name="interestType"]'
    )
  );

const PROGRAMS = ['''

    if "const combatProgramSection =" not in updated:
        updated = replace_once(
            updated,
            old_program_reference,
            new_program_reference,
            "interest UI element references"
        )

    # ---------------------------------------------------------
    # Fix redundant fallback expression
    # ---------------------------------------------------------

    old_interest_fallback = '''      clean(params.get("intent")) ||
      (
        selectedProgram
          ? "combat"
          : "combat"
      )
    );'''

    new_interest_fallback = '''      clean(params.get("intent")) ||
      "combat"
    );'''

    if old_interest_fallback in updated:
        updated = replace_once(
            updated,
            old_interest_fallback,
            new_interest_fallback,
            "interest fallback cleanup"
        )

    # ---------------------------------------------------------
    # Fix journey indentation
    # ---------------------------------------------------------

    updated = updated.replace(
        '''      journey:
    selectedProgram?.journey || "",''',
        '''    journey:
      selectedProgram?.journey || "",'''
    )

    # ---------------------------------------------------------
    # Add UI behavior before updatePrograms()
    # ---------------------------------------------------------

    marker = '''function updatePrograms() {
  if (!athleteAge || !programInterest) return;'''

    routing_ui = '''function getSelectedInterestType() {
  const selected =
    interestTypeInputs.find(
      (input) => input.checked
    );

  return normalizeInterestType(
    selected?.value || "combat"
  );
}

function syncInterestTypeFromUrl() {
  const params =
    new URLSearchParams(
      window.location.search
    );

  const requestedInterest =
    normalizeInterestType(
      params.get("interest") || "combat"
    );

  const matchingInput =
    interestTypeInputs.find(
      (input) =>
        input.value === requestedInterest
    );

  if (matchingInput) {
    matchingInput.checked = true;
  }
}

function updateInterestTypeUI() {
  const interestType =
    getSelectedInterestType();

  const needsCombatProgram =
    interestType === "combat" ||
    interestType === "both";

  if (combatProgramSection) {
    combatProgramSection.hidden =
      !needsCombatProgram;
  }

  if (programInterest) {
    programInterest.required =
      needsCombatProgram;

    programInterest.disabled =
      !needsCombatProgram;

    if (!needsCombatProgram) {
      programInterest.value = "";
    }
  }

  if (preferredDiscipline) {
    preferredDiscipline.disabled =
      !needsCombatProgram;

    if (!needsCombatProgram) {
      preferredDiscipline.value = "";
    }
  }

  if (needsCombatProgram) {
    updatePrograms();
  }
}

function updatePrograms() {
  if (!athleteAge || !programInterest) return;'''

    if "function updateInterestTypeUI()" not in updated:
        updated = replace_once(
            updated,
            marker,
            routing_ui,
            "interest selector behavior"
        )

    # ---------------------------------------------------------
    # Add listeners and initialize
    # ---------------------------------------------------------

    old_bottom = '''programInterest?.addEventListener(
  "change",
  syncPreferredDiscipline
);

renderIntent();

updatePrograms();
syncPreferredDiscipline();'''

    new_bottom = '''programInterest?.addEventListener(
  "change",
  syncPreferredDiscipline
);

interestTypeInputs.forEach((input) => {
  input.addEventListener(
    "change",
    updateInterestTypeUI
  );
});

syncInterestTypeFromUrl();
updateInterestTypeUI();

renderIntent();

updatePrograms();
syncPreferredDiscipline();'''

    if "syncInterestTypeFromUrl();" not in updated:
        updated = replace_once(
            updated,
            old_bottom,
            new_bottom,
            "interest selector initialization"
        )

    if updated == original:
        print("JavaScript already updated.")
        return None

    backup_path = backup(JS_FILE)
    JS_FILE.write_text(updated, encoding="utf-8")

    print(f"Updated JS:   {JS_FILE}")
    print(f"Backup JS:    {backup_path}")

    return backup_path


def main():
    update_html()
    update_js()

    print()
    print("Interest form behavior:")
    print("  Combat  -> shows combat program selector")
    print("  Fitness -> hides combat selector")
    print("  Both    -> shows combat program selector")
    print()
    print("URL context supported:")
    print("  ?academy=yesc&interest=fitness")
    print("  ?academy=yesc&interest=combat")
    print("  ?academy=yesc&interest=both")


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print()
        print(f"ERROR: {error}")
        sys.exit(1)
