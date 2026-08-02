from pathlib import Path
import shutil
import sys
from datetime import datetime


YESC_JS = Path(
    "public/connect/yesc/yesc-interest.js"
)

SANDMAN_JS = Path(
    "public/connect/interest/interest.js"
)


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


def create_backup(path: Path) -> Path:
    timestamp = datetime.now().strftime(
        "%Y%m%d-%H%M%S"
    )

    backup = path.with_name(
        f"{path.name}.before-shared-pipeline-{timestamp}"
    )

    shutil.copy2(path, backup)
    return backup


def update_sandman_interest() -> Path | None:
    if not SANDMAN_JS.exists():
        raise FileNotFoundError(
            f"Missing file: {SANDMAN_JS}"
        )

    original = SANDMAN_JS.read_text(
        encoding="utf-8"
    )

    updated = original

    old_add_doc = '''      await addDoc(
        collection(
          db,
          "interest_leads"
        ),
        {
          ...lead,
          ...routingMetadata,

          status: "new",
          source: "public-connect-form",

          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),

          contactedAt: null,
          appointmentScheduledAt: null,
          enrolledAt: null,

          coachNotes: "",
          assignedCoachUid: ""
        }
      );'''

    new_add_doc = '''      const leadRef =
        await addDoc(
          collection(
            db,
            "interest_leads"
          ),
          {
            ...lead,
            ...routingMetadata,

            status: "new",
            source: "public-connect-form",

            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),

            contactedAt: null,
            appointmentScheduledAt: null,
            enrolledAt: null,

            coachNotes: "",
            assignedCoachUid: ""
          }
        );'''

    if "const leadRef =" not in updated:
        updated = replace_once(
            updated,
            old_add_doc,
            new_add_doc,
            "capture Sandman lead ID"
        )

    old_params = '''            additionalParams: {
              submitted: "1"
            }'''

    new_params = '''            additionalParams: {
              submitted: "1",
              leadId: leadRef.id
            }'''

    if "leadId: leadRef.id" not in updated:
        updated = replace_once(
            updated,
            old_params,
            new_params,
            "pass lead ID to YESC"
        )

    if updated == original:
        print(
            "Sandman interest script already updated."
        )
        return None

    backup = create_backup(SANDMAN_JS)

    SANDMAN_JS.write_text(
        updated,
        encoding="utf-8"
    )

    print(f"Updated: {SANDMAN_JS}")
    print(f"Backup:  {backup}")

    return backup


def update_yesc_interest() -> Path | None:
    if not YESC_JS.exists():
        raise FileNotFoundError(
            f"Missing file: {YESC_JS}"
        )

    original = YESC_JS.read_text(
        encoding="utf-8"
    )

    updated = original

    old_import = '''import {
  db,
  addDoc,
  collection,
  serverTimestamp
} from "../../assets/js/firebase-init.js";'''

    new_import = '''import {
  db,
  addDoc,
  collection,
  serverTimestamp,
  ensureSignedIn
} from "../../assets/js/firebase-init.js";'''

    if "ensureSignedIn" not in updated:
        updated = replace_once(
            updated,
            old_import,
            new_import,
            "YESC Firebase import"
        )

    old_build_lead_start = '''  return {
    organization: "YESC",
    pipeline: "yesc",
    source: "marketing-fitness",
    status: "new",'''

    new_build_lead_start = '''  return {
    academyId: "yesc",
    academyName:
      "Youth Empowered Sports Club",
    academyModel:
      "partner-fitness-studio",

    organization: "YESC",
    pipeline: "yesc",

    interestType: "fitness",

    assignedProvider: "partner",
    combatProvider: "sandman",
    fitnessProvider: "partner",
    afterSchoolProvider: "partner",

    deliveryType: "hybrid",
    destinationRoute: "/connect/yesc/",

    fitnessToolsEnabled: true,
    screenFacilitatedClasses: true,

    source: "marketing-fitness",
    status: "new",'''

    if 'academyId: "yesc"' not in updated:
        updated = replace_once(
            updated,
            old_build_lead_start,
            new_build_lead_start,
            "YESC routing metadata"
        )

    old_contact_name = '''    contactName:
      clean(
        formData.get("contactName")
      ),'''

    new_contact_name = '''    contactName:
      clean(
        formData.get("contactName")
      ),

    parentName:
      clean(
        formData.get("contactName")
      ),'''

    if "    parentName:" not in updated:
        updated = replace_once(
            updated,
            old_contact_name,
            new_contact_name,
            "contact compatibility field"
        )

    old_participant_name = '''    participantName:
      clean(
        formData.get("participantName")
      ),'''

    new_participant_name = '''    participantName:
      clean(
        formData.get("participantName")
      ),

    athleteName:
      clean(
        formData.get("participantName")
      ),'''

    if "    athleteName:" not in updated:
        updated = replace_once(
            updated,
            old_participant_name,
            new_participant_name,
            "participant compatibility field"
        )

    old_participant_age = '''    participantAge:
      Number.isFinite(participantAge)
        ? participantAge
        : null,

    programInterest:'''

    new_participant_age = '''    participantAge:
      Number.isFinite(participantAge)
        ? participantAge
        : null,

    athleteAge:
      Number.isFinite(participantAge)
        ? participantAge
        : null,

    programInterest:'''

    if "    athleteAge:" not in updated:
        updated = replace_once(
            updated,
            old_participant_age,
            new_participant_age,
            "age compatibility field"
        )

    old_created_at = '''    pagePath:
      window.location.pathname,

    createdAt:
      serverTimestamp()
  };'''

    new_created_at = '''    pagePath:
      window.location.pathname,

    createdAt:
      serverTimestamp(),

    updatedAt:
      serverTimestamp(),

    contactedAt: null,
    appointmentScheduledAt: null,
    enrolledAt: null,

    coachNotes: "",
    assignedCoachUid: ""
  };'''

    if "updatedAt:" not in updated:
        updated = replace_once(
            updated,
            old_created_at,
            new_created_at,
            "shared lead timestamps"
        )

    old_try = '''    try {
      const writePromise =
        addDoc(
          collection(
            db,
            "yescInterest"
          ),
          lead
        );'''

    new_try = '''    try {
      await ensureSignedIn();

      const writePromise =
        addDoc(
          collection(
            db,
            "interest_leads"
          ),
          lead
        );'''

    if '"yescInterest"' in updated:
        updated = replace_once(
            updated,
            old_try,
            new_try,
            "shared Firestore collection"
        )

    marker = '''form?.addEventListener(
  "submit",'''

    handoff_logic = '''function handleExistingSandmanLead() {
  const params =
    new URLSearchParams(
      window.location.search
    );

  const alreadySubmitted =
    params.get("submitted") === "1";

  const leadId =
    clean(params.get("leadId"));

  if (!alreadySubmitted || !leadId) {
    return false;
  }

  const language =
    currentLanguage();

  window.location.replace(
    "/connect/yesc/interest-respond.html" +
    `?lang=${encodeURIComponent(language)}` +
    `&leadId=${encodeURIComponent(leadId)}`
  );

  return true;
}

const hasExistingSandmanLead =
  handleExistingSandmanLead();

if (hasExistingSandmanLead && form) {
  form.hidden = true;
}

form?.addEventListener(
  "submit",'''

    if "function handleExistingSandmanLead()" not in updated:
        updated = replace_once(
            updated,
            marker,
            handoff_logic,
            "Sandman-to-YESC lead handoff"
        )

    if updated == original:
        print(
            "YESC interest script already updated."
        )
        return None

    backup = create_backup(YESC_JS)

    YESC_JS.write_text(
        updated,
        encoding="utf-8"
    )

    print(f"Updated: {YESC_JS}")
    print(f"Backup:  {backup}")

    return backup


def main():
    update_sandman_interest()
    update_yesc_interest()

    print()
    print("Shared pipeline behavior:")
    print()
    print(
        "  Sandman fitness submission"
    )
    print(
        "    -> writes to interest_leads"
    )
    print(
        "    -> passes leadId to YESC"
    )
    print(
        "    -> skips duplicate YESC form"
    )
    print(
        "    -> lands on YESC response page"
    )
    print()
    print(
        "  Direct YESC submission"
    )
    print(
        "    -> writes to interest_leads"
    )
    print(
        "    -> tagged academyId=yesc"
    )
    print(
        "    -> lands on YESC response page"
    )


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print()
        print(f"ERROR: {error}")
        sys.exit(1)
