from pathlib import Path
from datetime import datetime
import shutil
import sys


SANDMAN_HTML = Path(
    "public/connect/interest/index.html"
)

SANDMAN_JS = Path(
    "public/connect/interest/interest.js"
)

SANDMAN_THANKS = Path(
    "public/connect/thanks/index.html"
)

YESC_HTML = Path(
    "public/connect/yesc/index.html"
)

YESC_JS = Path(
    "public/connect/yesc/yesc-interest.js"
)

YESC_THANKS = Path(
    "public/connect/yesc/interest-respond.html"
)


def backup(path: Path) -> Path:
    timestamp = datetime.now().strftime(
        "%Y%m%d-%H%M%S"
    )

    backup_path = path.with_name(
        f"{path.name}.before-registrant-role-{timestamp}"
    )

    shutil.copy2(path, backup_path)

    return backup_path


def replace_once(
    text: str,
    old: str,
    new: str,
    label: str
) -> str:
    count = text.count(old)

    if count != 1:
        raise RuntimeError(
            f"{label}: expected one match, found {count}"
        )

    return text.replace(old, new, 1)


REGISTRANT_SECTION = '''
        <section class="form-section">
          <h2>
            <span data-lang="en">
              Who Is Completing This Form?
            </span>

            <span data-lang="es">
              ¿Quién Está Completando Este Formulario?
            </span>
          </h2>

          <div class="field">
            <label>
              <span data-lang="en">
                Select the option that best applies.
              </span>

              <span data-lang="es">
                Selecciona la opción que corresponda.
              </span>
            </label>

            <div class="registrant-role-options">
              <label class="registrant-role-option">
                <input
                  type="radio"
                  name="registrantRole"
                  value="parent-guardian"
                  checked
                />

                <span>
                  <strong>
                    <span data-lang="en">
                      Parent or Guardian
                    </span>

                    <span data-lang="es">
                      Padre, Madre o Tutor
                    </span>
                  </strong>

                  <small>
                    <span data-lang="en">
                      I am completing this form for an athlete.
                    </span>

                    <span data-lang="es">
                      Estoy completando este formulario para un atleta.
                    </span>
                  </small>
                </span>
              </label>

              <label class="registrant-role-option">
                <input
                  type="radio"
                  name="registrantRole"
                  value="adult-athlete"
                />

                <span>
                  <strong>
                    <span data-lang="en">
                      Adult Athlete, Age 18+
                    </span>

                    <span data-lang="es">
                      Atleta Adulto, Mayor de 18 Años
                    </span>
                  </strong>

                  <small>
                    <span data-lang="en">
                      I am registering myself.
                    </span>

                    <span data-lang="es">
                      Me estoy registrando personalmente.
                    </span>
                  </small>
                </span>
              </label>
            </div>
          </div>
        </section>
'''.strip()


REGISTRANT_CSS = '''
    .registrant-role-options {
      display: grid;
      grid-template-columns: repeat(
        2,
        minmax(0, 1fr)
      );
      gap: 12px;
    }

    .registrant-role-option {
      position: relative;
      display: block;
      cursor: pointer;
    }

    .registrant-role-option input {
      position: absolute;
      opacity: 0;
      pointer-events: none;
    }

    .registrant-role-option > span {
      display: block;
      min-height: 108px;
      padding: 18px;
      border: 1px solid
        rgba(255, 255, 255, 0.18);
      border-radius: 14px;
      background:
        rgba(255, 255, 255, 0.04);
      text-align: center;
      transition:
        border-color 160ms ease,
        background 160ms ease,
        transform 160ms ease;
    }

    .registrant-role-option:hover > span {
      transform: translateY(-1px);
      border-color:
        rgba(250, 204, 21, 0.55);
    }

    .registrant-role-option input:checked +
    span {
      border-color: #facc15;
      background:
        rgba(250, 204, 21, 0.12);
    }

    .registrant-role-option strong,
    .registrant-role-option small {
      display: block;
    }

    .registrant-role-option small {
      margin-top: 7px;
      opacity: 0.72;
      line-height: 1.45;
    }

    @media (max-width: 680px) {
      .registrant-role-options {
        grid-template-columns: 1fr;
      }
    }
'''.strip()

def add_registrant_css(
    text: str
) -> str:
    if ".registrant-role-options" in text:
        return text

    if "</style>" in text:
        return text.replace(
            "</style>",            f"{REGISTRANT_CSS}\n  </style>",
            1
        )

    if "</head>" in text:
        style_block = (
            "\n  <style>\n"
            f"{REGISTRANT_CSS}\n"
            "  </style>\n"
        )

        return text.replace(
            "</head>",
            f"{style_block}</head>",
            1
        )

    raise RuntimeError(
        "Could not find </style> or </head> "
        "for registrant role CSS."
    )


def update_sandman_html():
    if not SANDMAN_HTML.exists():
        raise FileNotFoundError(
            SANDMAN_HTML
        )

    original = SANDMAN_HTML.read_text(
        encoding="utf-8"
    )

    updated = add_registrant_css(
        original
    )

    marker = '''
        <section class="form-section">
          <h2>
            <span data-lang="en">
              Parent or Guardian
            </span>
'''.strip()

    replacement = f'''
{REGISTRANT_SECTION}

        <section
          id="guardianInformationSection"
          class="form-section"
        >
          <h2>
            <span
              id="guardianHeadingEnglish"
              data-lang="en"
            >
              Parent or Guardian
            </span>
'''.strip()

    if 'name="registrantRole"' not in updated:
        updated = replace_once(
            updated,
            marker,
            replacement,
            "Sandman registrant selector"
        )

    updated = updated.replace(
        '<label for="parentName">',
        '''<label
              id="parentNameLabel"
              for="parentName"
            >''',
        1
    )

    athlete_field_marker = '''
          <div class="field">
            <label for="athleteName">
'''.strip()

    athlete_field_replacement = '''
          <div
            id="athleteNameField"
            class="field"
          >
            <label for="athleteName">
'''.strip()

    if 'id="athleteNameField"' not in updated:
        updated = replace_once(
            updated,
            athlete_field_marker,
            athlete_field_replacement,
            "Sandman athlete-name field"
        )

    if updated == original:
        print(
            "Sandman interest HTML already updated."
        )
        return

    backup_path = backup(
        SANDMAN_HTML
    )

    SANDMAN_HTML.write_text(
        updated,
        encoding="utf-8"
    )

    print(
        f"Updated: {SANDMAN_HTML}"
    )
    print(
        f"Backup:  {backup_path}"
    )


def update_sandman_js():
    if not SANDMAN_JS.exists():
        raise FileNotFoundError(
            SANDMAN_JS
        )

    original = SANDMAN_JS.read_text(
        encoding="utf-8"
    )

    updated = original

    marker = '''const formStatus =
  document.getElementById("formStatus");'''

    replacement = '''const formStatus =
  document.getElementById("formStatus");

const parentNameInput =
  document.getElementById("parentName");

const athleteNameInput =
  document.getElementById("athleteName");

const athleteNameField =
  document.getElementById("athleteNameField");

const parentNameLabel =
  document.getElementById("parentNameLabel");

const registrantRoleInputs =
  Array.from(
    document.querySelectorAll(
      'input[name="registrantRole"]'
    )
  );'''

    if "const registrantRoleInputs =" not in updated:
        updated = replace_once(
            updated,
            marker,
            replacement,
            "Sandman role references"
        )

    marker = '''function readForm() {
  const formData = new FormData(form);'''

    replacement = '''function readForm() {
  const formData = new FormData(form);

  const registrantRole =
    clean(
      formData.get("registrantRole")
    ) || "parent-guardian";

  const enteredRegistrantName =
    clean(
      formData.get("parentName")
    );

  const enteredAthleteName =
    clean(
      formData.get("athleteName")
    );

  const resolvedAthleteName =
    registrantRole === "adult-athlete"
      ? enteredRegistrantName
      : enteredAthleteName;'''

    if "const registrantRole =" not in updated:
        updated = replace_once(
            updated,
            marker,
            replacement,
            "Sandman role reading"
        )

    old_names = '''    parentName:
      clean(formData.get("parentName")),

    athleteName:
      clean(formData.get("athleteName")),

    athleteAge:'''

    new_names = '''    registrantRole,

    registrantName:
      enteredRegistrantName,

    parentName:
      registrantRole === "parent-guardian"
        ? enteredRegistrantName
        : "",

    athleteName:
      resolvedAthleteName,

    athleteAge:'''

    if "    registrantName:" not in updated:
        updated = replace_once(
            updated,
            old_names,
            new_names,
            "Sandman canonical names"
        )

    old_parent_validation = '''  if (!lead.parentName) {
    return message(
      "Enter the parent or guardian name.",
      "Ingresa el nombre del padre, madre o tutor."
    );
  }

  if (!lead.athleteName) {'''

    new_parent_validation = '''  if (!lead.registrantName) {
    return message(
      lead.registrantRole === "adult-athlete"
        ? "Enter your name."
        : "Enter the parent or guardian name.",
      lead.registrantRole === "adult-athlete"
        ? "Ingresa tu nombre."
        : "Ingresa el nombre del padre, madre o tutor."
    );
  }

  if (!lead.athleteName) {'''

    if "if (!lead.registrantName)" not in updated:
        updated = replace_once(
            updated,
            old_parent_validation,
            new_parent_validation,
            "Sandman role validation"
        )

    old_thanks = '''      window.location.assign(
        `/connect/thanks/?lang=${language}`
      );'''

    new_thanks = '''      window.location.assign(
        "/connect/thanks/" +
        `?lang=${encodeURIComponent(language)}` +
        `&registrantRole=${encodeURIComponent(
          lead.registrantRole
        )}`
      );'''

    if "registrantRole=${encodeURIComponent" not in updated:
        updated = replace_once(
            updated,
            old_thanks,
            new_thanks,
            "Sandman thank-you role"
        )

    marker = '''function getSelectedInterestType() {'''

    role_functions = '''function getRegistrantRole() {
  const selected =
    registrantRoleInputs.find(
      (input) => input.checked
    );

  return selected?.value === "adult-athlete"
    ? "adult-athlete"
    : "parent-guardian";
}

function updateRegistrantRoleUI() {
  const role =
    getRegistrantRole();

  const isAdultAthlete =
    role === "adult-athlete";

  if (athleteNameField) {
    athleteNameField.hidden =
      isAdultAthlete;
  }

  if (athleteNameInput) {
    athleteNameInput.required =
      !isAdultAthlete;

    athleteNameInput.disabled =
      isAdultAthlete;

    if (isAdultAthlete) {
      athleteNameInput.value =
        parentNameInput?.value || "";
    }
  }

  if (parentNameLabel) {
    parentNameLabel
      .querySelectorAll(
        '[data-lang="en"]'
      )
      .forEach((element) => {
        element.textContent =
          isAdultAthlete
            ? "Your Name"
            : "Parent or Guardian Name";
      });

    parentNameLabel
      .querySelectorAll(
        '[data-lang="es"]'
      )
      .forEach((element) => {
        element.textContent =
          isAdultAthlete
            ? "Tu Nombre"
            : "Nombre del Padre, Madre o Tutor";
      });
  }
}

function getSelectedInterestType() {'''

    if "function updateRegistrantRoleUI()" not in updated:
        updated = replace_once(
            updated,
            marker,
            role_functions,
            "Sandman role UI"
        )

    marker = '''interestTypeInputs.forEach((input) => {
  input.addEventListener(
    "change",
    updateInterestTypeUI
  );
});

syncInterestTypeFromUrl();'''

    replacement = '''interestTypeInputs.forEach((input) => {
  input.addEventListener(
    "change",
    updateInterestTypeUI
  );
});

registrantRoleInputs.forEach((input) => {
  input.addEventListener(
    "change",
    updateRegistrantRoleUI
  );
});

parentNameInput?.addEventListener(
  "input",
  () => {
    if (
      getRegistrantRole() ===
      "adult-athlete" &&
      athleteNameInput
    ) {
      athleteNameInput.value =
        parentNameInput.value;
    }
  }
);

updateRegistrantRoleUI();

syncInterestTypeFromUrl();'''

    if "updateRegistrantRoleUI();\n\nsyncInterestTypeFromUrl();" not in updated:
        updated = replace_once(
            updated,
            marker,
            replacement,
            "Sandman role initialization"
        )

    if updated == original:
        print(
            "Sandman interest JS already updated."
        )
        return

    backup_path = backup(
        SANDMAN_JS
    )

    SANDMAN_JS.write_text(
        updated,
        encoding="utf-8"
    )

    print(
        f"Updated: {SANDMAN_JS}"
    )
    print(
        f"Backup:  {backup_path}"
    )


def update_yesc_html():
    if not YESC_HTML.exists():
        print(
            f"Skipped missing YESC HTML: {YESC_HTML}"
        )
        return

    original = YESC_HTML.read_text(
        encoding="utf-8"
    )

    updated = add_registrant_css(
        original
    )

    form_marker = '''<form
'''

    if 'name="registrantRole"' not in updated:
        form_start = updated.find(
            'id="yescInterestForm"'
        )

        if form_start == -1:
            raise RuntimeError(
                "Could not find yescInterestForm."
            )

        closing = updated.find(
            ">",
            form_start
        )

        if closing == -1:
            raise RuntimeError(
                "Could not find end of YESC form tag."
            )

        updated = (
            updated[:closing + 1] +
            "\n" +
            REGISTRANT_SECTION +
            "\n" +
            updated[closing + 1:]
        )

    participant_marker = '''
  <div class="field">
    <label for="participantName">
'''.strip()

    participant_replacement = '''
  <div
    id="yescParticipantNameField"
    class="field"
  >
    <label for="participantName">
'''.strip()

    if (
        'id="yescParticipantNameField"'
        not in updated and
        participant_marker in updated
    ):
        updated = replace_once(
            updated,
            participant_marker,
            participant_replacement,
            "YESC participant field"
        )

    if updated == original:
        print(
            "YESC interest HTML already updated."
        )
        return

    backup_path = backup(
        YESC_HTML
    )

    YESC_HTML.write_text(
        updated,
        encoding="utf-8"
    )

    print(
        f"Updated: {YESC_HTML}"
    )
    print(
        f"Backup:  {backup_path}"
    )


def update_yesc_js():
    if not YESC_JS.exists():
        raise FileNotFoundError(
            YESC_JS
        )

    original = YESC_JS.read_text(
        encoding="utf-8"
    )

    updated = original

    marker = '''const submitButton =
  document.getElementById("yescSubmitButton");'''

    replacement = '''const submitButton =
  document.getElementById("yescSubmitButton");

const yescContactName =
  document.getElementById("contactName");

const yescParticipantName =
  document.getElementById("participantName");

const yescParticipantNameField =
  document.getElementById(
    "yescParticipantNameField"
  );

const registrantRoleInputs =
  Array.from(
    document.querySelectorAll(
      'input[name="registrantRole"]'
    )
  );'''

    if "const yescContactName =" not in updated:
        updated = replace_once(
            updated,
            marker,
            replacement,
            "YESC role references"
        )

    marker = '''function buildLead(formData) {
  const participantAge ='''

    replacement = '''function buildLead(formData) {
  const registrantRole =
    clean(
      formData.get("registrantRole")
    ) || "parent-guardian";

  const contactName =
    clean(
      formData.get("contactName")
    );

  const enteredParticipantName =
    clean(
      formData.get("participantName")
    );

  const participantName =
    registrantRole === "adult-athlete"
      ? contactName
      : enteredParticipantName;

  const participantAge ='''

    if "const enteredParticipantName =" not in updated:
        updated = replace_once(
            updated,
            marker,
            replacement,
            "YESC role reading"
        )

    old_contact = '''    contactName:
      clean(
        formData.get("contactName")
      ),

    parentName:
      clean(
        formData.get("contactName")
      ),'''

    new_contact = '''    registrantRole,

    registrantName:
      contactName,

    contactName,

    parentName:
      registrantRole === "parent-guardian"
        ? contactName
        : "",'''

    if "    registrantName:" not in updated:
        updated = replace_once(
            updated,
            old_contact,
            new_contact,
            "YESC canonical contact"
        )

    old_participant = '''    participantName:
      clean(
        formData.get("participantName")
      ),

    athleteName:
      clean(
        formData.get("participantName")
      ),'''

    new_participant = '''    participantName,

    athleteName:
      participantName,'''

    if old_participant in updated:
        updated = replace_once(
            updated,
            old_participant,
            new_participant,
            "YESC canonical participant"
        )

    old_redirect = '''      window.location.assign(
        `/connect/yesc/interest-respond.html?lang=${language}`
      );'''

    new_redirect = '''      window.location.assign(
        "/connect/yesc/interest-respond.html" +
        `?lang=${encodeURIComponent(language)}` +
        `&registrantRole=${encodeURIComponent(
          lead.registrantRole
        )}`
      );'''

    if (
        "lead.registrantRole" not in
        updated[
            updated.find(
                "interest-respond.html"
            ):
        ]
    ):
        updated = replace_once(
            updated,
            old_redirect,
            new_redirect,
            "YESC thank-you role"
        )

    marker = '''form?.addEventListener(
  "submit",'''

    role_ui = '''function getRegistrantRole() {
  const selected =
    registrantRoleInputs.find(
      (input) => input.checked
    );

  return selected?.value === "adult-athlete"
    ? "adult-athlete"
    : "parent-guardian";
}

function updateRegistrantRoleUI() {
  const isAdultAthlete =
    getRegistrantRole() ===
    "adult-athlete";

  if (yescParticipantNameField) {
    yescParticipantNameField.hidden =
      isAdultAthlete;
  }

  if (yescParticipantName) {
    yescParticipantName.required =
      !isAdultAthlete;

    yescParticipantName.disabled =
      isAdultAthlete;

    if (isAdultAthlete) {
      yescParticipantName.value =
        yescContactName?.value || "";
    }
  }
}

registrantRoleInputs.forEach((input) => {
  input.addEventListener(
    "change",
    updateRegistrantRoleUI
  );
});

yescContactName?.addEventListener(
  "input",
  () => {
    if (
      getRegistrantRole() ===
      "adult-athlete" &&
      yescParticipantName
    ) {
      yescParticipantName.value =
        yescContactName.value;
    }
  }
);

updateRegistrantRoleUI();

form?.addEventListener(
  "submit",'''

    if "function updateRegistrantRoleUI()" not in updated:
        updated = replace_once(
            updated,
            marker,
            role_ui,
            "YESC role UI"
        )

    if updated == original:
        print(
            "YESC interest JS already updated."
        )
        return

    backup_path = backup(
        YESC_JS
    )

    YESC_JS.write_text(
        updated,
        encoding="utf-8"
    )

    print(
        f"Updated: {YESC_JS}"
    )
    print(
        f"Backup:  {backup_path}"
    )


def add_confirmation_script(
    path: Path,
    sandman: bool
):
    if not path.exists():
        print(
            f"Skipped missing confirmation: {path}"
        )
        return

    original = path.read_text(
        encoding="utf-8"
    )

    if "registrantRoleConfirmation" in original:
        print(
            f"Confirmation already updated: {path}"
        )
        return

    if sandman:
        block = '''
      <div id="registrantRoleConfirmation">
        <p
          class="lead"
          data-confirmation-role="parent-guardian"
        >
          <span data-lang="en">
            We have received your family’s interest form.
            A Sandman coach will review the athlete’s
            information, goals, experience, and program
            interests before contacting you.
          </span>

          <span data-lang="es">
            Hemos recibido el formulario de interés de tu
            familia. Un entrenador de Sandman revisará la
            información, los objetivos, la experiencia y los
            programas de interés del atleta antes de
            comunicarse contigo.
          </span>
        </p>

        <p
          class="lead"
          data-confirmation-role="adult-athlete"
          hidden
        >
          <span data-lang="en">
            We have received your interest form. A Sandman
            coach will review your goals, experience, and
            program interests before contacting you.
          </span>

          <span data-lang="es">
            Hemos recibido tu formulario de interés. Un
            entrenador de Sandman revisará tus objetivos,
            experiencia y programas de interés antes de
            comunicarse contigo.
          </span>
        </p>
      </div>
'''.strip()
    else:
        block = '''
      <div id="registrantRoleConfirmation">
        <p
          class="lead"
          data-confirmation-role="parent-guardian"
        >
          <span data-lang="en">
            We received your family’s interest form. A YESC
            team member will review the participant’s
            information and help your family find the right
            program.
          </span>

          <span data-lang="es">
            Recibimos el formulario de interés de tu familia.
            Un miembro del equipo de YESC revisará la
            información del participante y ayudará a tu
            familia a encontrar el programa adecuado.
          </span>
        </p>

        <p
          class="lead"
          data-confirmation-role="adult-athlete"
          hidden
        >
          <span data-lang="en">
            We received your interest form. A YESC team
            member will review your information and help you
            find the right program.
          </span>

          <span data-lang="es">
            Recibimos tu formulario de interés. Un miembro
            del equipo de YESC revisará tu información y te
            ayudará a encontrar el programa adecuado.
          </span>
        </p>
      </div>
'''.strip()

    h1_end = original.find(
        "</h1>"
    )

    if h1_end == -1:
        raise RuntimeError(
            f"Could not find </h1> in {path}"
        )

    h1_end += len("</h1>")

    updated = (
        original[:h1_end] +
        "\n\n" +
        block +
        original[h1_end:]
    )

    script = '''
<script id="registrantRoleConfirmation">
  (() => {
    const params =
      new URLSearchParams(
        window.location.search
      );

    const role =
      params.get("registrantRole") ===
      "adult-athlete"
        ? "adult-athlete"
        : "parent-guardian";

    document
      .querySelectorAll(
        "[data-confirmation-role]"
      )
      .forEach((element) => {
        element.hidden =
          element.dataset
            .confirmationRole !== role;
      });
  })();
</script>
'''.strip()

    updated = replace_once(
        updated,
        "</body>",
        f"{script}\n</body>",
        f"confirmation role script {path}"
    )

    backup_path = backup(
        path
    )

    path.write_text(
        updated,
        encoding="utf-8"
    )

    print(
        f"Updated: {path}"
    )
    print(
        f"Backup:  {backup_path}"
    )


def main():
    update_sandman_html()
    update_sandman_js()

    update_yesc_html()
    update_yesc_js()

    add_confirmation_script(
        SANDMAN_THANKS,
        sandman=True
    )

    add_confirmation_script(
        YESC_THANKS,
        sandman=False
    )

    print()
    print("Registrant role logic added:")
    print(
        "  parent-guardian -> family wording"
    )
    print(
        "  adult-athlete   -> direct wording"
    )
    print()
    print(
        "Adult athlete name is copied into "
        "the athlete/participant record."
    )


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print()
        print(f"ERROR: {error}")
        sys.exit(1)
