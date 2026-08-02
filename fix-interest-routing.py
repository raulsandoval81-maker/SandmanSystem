from pathlib import Path
import shutil
import sys
from datetime import datetime


PUBLIC_ROOT = Path("public")

ROUTING_IMPORT = '''
import {
  getAcademyIdFromUrl,
  getLanguageFromUrl,
  normalizeInterestType,
  buildLeadRoutingMetadata,
  buildAcademyDestination
} from "/assets/js/academy-routing.js";
'''.strip()


def find_interest_file() -> Path:
    matches = []

    for path in PUBLIC_ROOT.rglob("*.js"):
        if ".before-" in path.name:
            continue

        try:
            text = path.read_text(encoding="utf-8")
        except UnicodeDecodeError:
            continue

        if (
            '[interest] interest.js loaded' in text
            and 'collection(' in text
            and '"interest_leads"' in text
        ):
            matches.append(path)

    if not matches:
        raise FileNotFoundError(
            "Could not locate the Sandman interest JavaScript file."
        )

    if len(matches) > 1:
        print("Multiple possible interest files found:")
        for path in matches:
            print(f"  {path}")

        raise RuntimeError(
            "More than one interest file matched. "
            "Remove duplicates or set the path manually."
        )

    return matches[0]


def replace_once(
    text: str,
    old: str,
    new: str,
    label: str
) -> str:
    count = text.count(old)

    if count != 1:
        raise RuntimeError(
            f"{label}: expected exactly one match, found {count}."
        )

    return text.replace(old, new, 1)


def main() -> None:
    path = find_interest_file()
    original = path.read_text(encoding="utf-8")
    updated = original

    print(f"Found interest file: {path}")

    # ---------------------------------------------------------
    # 1. Import academy routing functions
    # ---------------------------------------------------------

    firebase_import = '''import {
  db,
  collection,
  addDoc,
  serverTimestamp,
  ensureSignedIn
} from "/assets/js/firebase-init.js";'''

    if ROUTING_IMPORT not in updated:
        updated = replace_once(
            updated,
            firebase_import,
            firebase_import + "\n\n" + ROUTING_IMPORT,
            "academy routing import"
        )

    # ---------------------------------------------------------
    # 2. Add academy and interest context to readForm()
    # ---------------------------------------------------------

    old_selected_program = '''  const selectedProgram =
  PROGRAMS.find(
    (program) =>
      program.value ===
      clean(formData.get("programInterest"))
  );

  return {'''

    new_selected_program = '''  const selectedProgram =
  PROGRAMS.find(
    (program) =>
      program.value ===
      clean(formData.get("programInterest"))
  );

  const params =
    new URLSearchParams(
      window.location.search
    );

  const academyId =
    getAcademyIdFromUrl(
      window.location.search
    );

  const interestType =
    normalizeInterestType(
      clean(formData.get("interestType")) ||
      clean(params.get("interest")) ||
      clean(params.get("intent")) ||
      (
        selectedProgram
          ? "combat"
          : "combat"
      )
    );

  return {'''

    if "const academyId =" not in updated:
        updated = replace_once(
            updated,
            old_selected_program,
            new_selected_program,
            "readForm academy context"
        )

    old_parent_name = '''    parentName:
      clean(formData.get("parentName")),

    athleteName:'''

    new_parent_name = '''    academyId,
    interestType,

    parentName:
      clean(formData.get("parentName")),

    athleteName:'''

    if "    academyId,\n    interestType," not in updated:
        updated = replace_once(
            updated,
            old_parent_name,
            new_parent_name,
            "lead academy fields"
        )

    # ---------------------------------------------------------
    # 3. Make age validation aware of fitness and after-school
    # ---------------------------------------------------------

    old_age_validation = '''  if (
    !Number.isFinite(lead.athleteAge) ||
    lead.athleteAge < 7 ||
    lead.athleteAge > 99
  ) {
   
    return message(
     "Enter a valid athlete age (7 or older).",
     "Ingresa una edad válida (7 años o más)."
);
  }'''

    new_age_validation = '''  const isCombatInterest =
    lead.interestType === "combat" ||
    lead.interestType === "both";

  const minimumAge =
    isCombatInterest
      ? 7
      : 2;

  if (
    !Number.isFinite(lead.athleteAge) ||
    lead.athleteAge < minimumAge ||
    lead.athleteAge > 99
  ) {
    return message(
      isCombatInterest
        ? "Enter a valid athlete age (7 or older)."
        : "Enter a valid participant age.",
      isCombatInterest
        ? "Ingresa una edad válida (7 años o más)."
        : "Ingresa una edad válida para el participante."
    );
  }'''

    if "const isCombatInterest =" not in updated:
        updated = replace_once(
            updated,
            old_age_validation,
            new_age_validation,
            "conditional age validation"
        )

    # ---------------------------------------------------------
    # 4. Require a Sandman program only for combat or both
    # ---------------------------------------------------------

    old_program_validation = '''  if (!lead.programInterest) {
    return message(
      "Select a program.",
      "Selecciona un programa."
    );
  }

  const selectedProgram =
  PROGRAMS.find(
    (program) =>
      program.value ===
      lead.programInterest
  );

if (!selectedProgram) {
  return message(
    "Select a valid Sandman program.",
    "Selecciona un programa Sandman válido."
  );
}

const validAge =
  lead.athleteAge >= selectedProgram.min &&
  (
    selectedProgram.max === null ||
    lead.athleteAge <= selectedProgram.max
  );

if (!validAge) {
  return message(
    "The selected program does not match the athlete's age.",
    "El programa seleccionado no corresponde con la edad del atleta."
  );
}'''

    new_program_validation = '''  if (isCombatInterest) {
    if (!lead.programInterest) {
      return message(
        "Select a combat program.",
        "Selecciona un programa de combate."
      );
    }

    const selectedProgram =
      PROGRAMS.find(
        (program) =>
          program.value ===
          lead.programInterest
      );

    if (!selectedProgram) {
      return message(
        "Select a valid Sandman program.",
        "Selecciona un programa Sandman válido."
      );
    }

    const validAge =
      lead.athleteAge >= selectedProgram.min &&
      (
        selectedProgram.max === null ||
        lead.athleteAge <= selectedProgram.max
      );

    if (!validAge) {
      return message(
        "The selected program does not match the athlete's age.",
        "El programa seleccionado no corresponde con la edad del atleta."
      );
    }
  }'''

    if "if (isCombatInterest) {" not in updated:
        updated = replace_once(
            updated,
            old_program_validation,
            new_program_validation,
            "conditional program validation"
        )

    # ---------------------------------------------------------
    # 5. Build and store routing metadata before Firestore write
    # ---------------------------------------------------------

    old_try = '''    try {
      await ensureSignedIn();

      await addDoc('''

    new_try = '''    try {
      await ensureSignedIn();

      const routingMetadata =
        buildLeadRoutingMetadata({
          academyId: lead.academyId,
          interestType: lead.interestType
        });

      await addDoc('''

    if "const routingMetadata =" not in updated:
        updated = replace_once(
            updated,
            old_try,
            new_try,
            "routing metadata creation"
        )

    old_lead_write = '''        {
          ...lead,

          status: "new",
          source: "public-connect-form",'''

    new_lead_write = '''        {
          ...lead,
          ...routingMetadata,

          status: "new",
          source: "public-connect-form",'''

    if "...routingMetadata" not in updated:
        updated = replace_once(
            updated,
            old_lead_write,
            new_lead_write,
            "routing metadata Firestore write"
        )

    # ---------------------------------------------------------
    # 6. Replace old contact.html redirect
    #
    # Fitness and after-school use the academy routing valve.
    # Combat and both finish on the Sandman thank-you page.
    # ---------------------------------------------------------

    old_redirect = '''      const thanksUrl =
        lead.preferredLanguage === "es"
          ? "/connect/thanks/contact.html?lang=es"
          : "/connect/thanks/contact.html?lang=en";

      window.location.href = thanksUrl;'''

    new_redirect = '''      const language =
        lead.preferredLanguage === "es"
          ? "es"
          : getLanguageFromUrl(
              window.location.search
            );

      const routesAwayFromSandman =
        lead.interestType === "fitness" ||
        lead.interestType === "after-school";

      if (routesAwayFromSandman) {
        const destination =
          buildAcademyDestination({
            academyId: lead.academyId,
            interestType: lead.interestType,
            language,
            additionalParams: {
              submitted: "1"
            }
          });

        window.location.assign(destination);
        return;
      }

      window.location.assign(
        `/connect/thanks/?lang=${language}`
      );'''

    if 'routesAwayFromSandman' not in updated:
        updated = replace_once(
            updated,
            old_redirect,
            new_redirect,
            "post-submission redirect"
        )

    # ---------------------------------------------------------
    # Save backup and updated file
    # ---------------------------------------------------------

    if updated == original:
        print("No changes were needed.")
        return

    timestamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    backup = path.with_name(
        f"{path.name}.before-academy-routing-{timestamp}"
    )

    shutil.copy2(path, backup)
    path.write_text(updated, encoding="utf-8")

    print()
    print("Updated:")
    print(f"  {path}")
    print()
    print("Backup:")
    print(f"  {backup}")
    print()
    print("Routing behavior:")
    print("  combat       -> /connect/thanks/")
    print("  both         -> /connect/thanks/")
    print("  fitness      -> academy-assigned destination")
    print("  after-school -> academy-assigned destination")


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print()
        print(f"ERROR: {error}")
        sys.exit(1)
