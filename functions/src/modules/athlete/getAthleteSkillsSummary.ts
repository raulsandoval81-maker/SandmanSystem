import {
  onCall,
  HttpsError,
} from "firebase-functions/v2/https";

import { requireAthleteProfileRead } from "../../services/athleteProfileReadAuthorization";

const ALLOWED_STATES = new Set([
  "LEARNED",
  "APPLIED",
  "MASTERED",
  "REFINED",
]);

function clean(value: unknown): string {
  return String(value ?? "").trim();
}

function normalizeDiscipline(value: unknown): string {
  const raw = clean(value).toLowerCase();

  if (raw.includes("wrest")) return "wrestling";

  if (
    raw.includes("muay") ||
    raw.includes("kickbox")
  ) {
    return "muay-thai";
  }

  if (raw.includes("box")) return "boxing";

  return raw.replace(/[\s_]+/g, "-");
}

function skillDocDiscipline(
  docId: string,
  data: Record<string, unknown>
): string {
  const explicit =
    normalizeDiscipline(data.discipline);

  if (explicit) return explicit;

  const separator = docId.indexOf("__");

  if (separator > 0) {
    return normalizeDiscipline(
      docId.slice(0, separator)
    );
  }

  return "wrestling";
}

function skillDocFamilyId(
  docId: string,
  data: Record<string, unknown>
): string {
  const explicit =
    clean(data.familyId).toLowerCase();

  if (explicit) return explicit;

  const separator = docId.indexOf("__");

  return separator > 0
    ? docId.slice(separator + 2)
    : docId;
}

export const getAthleteSkillsSummary =
  onCall(async (req) => {
    const { db, athleteId } = await requireAthleteProfileRead(
      req.auth, req.data?.athleteId || req.data?.uid,
    );

    const discipline =
      normalizeDiscipline(
        req.data?.discipline || "wrestling"
      );

    if (!["wrestling", "boxing", "muay-thai"].includes(
      discipline
    )) {
      throw new HttpsError(
        "invalid-argument",
        "Unsupported skills discipline."
      );
    }

    const snapshot =
      await db
        .collection("athletes")
        .doc(athleteId)
        .collection("skills")
        .get();

    const skillsByFamily =
      snapshot.docs.reduce((map, docSnap) => {
        const data =
          docSnap.data() || {};

        const docDiscipline =
          skillDocDiscipline(
            docSnap.id,
            data
          );

        if (docDiscipline !== discipline) {
          return map;
        }

        const familyId =
          skillDocFamilyId(
            docSnap.id,
            data
          );

        const state =
          clean(
            data.state ||
            data.status ||
            "NOT_INTRODUCED"
          ).toUpperCase();

        if (!ALLOWED_STATES.has(state)) {
          return map;
        }

        const isCanonical =
          docSnap.id ===
          `${discipline}__${familyId}`;

        const existing =
          map.get(familyId);

        if (!existing || isCanonical) {
          map.set(familyId, {
            familyId,
            name:
              clean(
                data.name ||
                data.familyId ||
                familyId
              ),
            state,
          });
        }

        return map;
      }, new Map<string, {
        familyId: string;
        name: string;
        state: string;
      }>());

    const skills =
      Array.from(skillsByFamily.values())
        .sort((a, b) =>
          a.name.localeCompare(b.name)
        );

    return {
      ok: true,
      athleteId,
      discipline,
      skills,
    };
  });
