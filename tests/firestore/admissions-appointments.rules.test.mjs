import fs from "node:fs";
import test, {
  before,
  beforeEach,
  after,
} from "node:test";

import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
} from "@firebase/rules-unit-testing";

import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";

const PROJECT_ID =
  "sandman-admissions-appointments-rules-test";

let env;

before(async () => {
  env = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      host: "127.0.0.1",
      port: 8081,
      rules: fs.readFileSync(
        "firestore.rules",
        "utf8"
      ),
    },
  });
});

beforeEach(async () => {
  await env.clearFirestore();

  await env.withSecurityRulesDisabled(
    async (context) => {
      const db = context.firestore();

      await setDoc(
        doc(db, "staff", "admin-1"),
        {
          role: "admin",
          status: "active",
        }
      );

      await setDoc(
        doc(db, "staff", "manager-lompoc"),
        {
          role: "management",
          status: "active",
          locationIds: ["lompoc"],
        }
      );

      await setDoc(
        doc(db, "staff", "coach-a"),
        {
          role: "coach",
          status: "active",
          fullName: "Coach A",
        }
      );

      await setDoc(
        doc(db, "staff", "coach-b"),
        {
          role: "coach",
          status: "active",
          fullName: "Coach B",
        }
      );

      await setDoc(
        doc(db, "staff", "coach-inactive"),
        {
          role: "coach",
          status: "inactive",
          fullName: "Inactive Coach",
        }
      );

      await setDoc(
        doc(
          db,
          "admissions_appointments",
          "assigned-a"
        ),
        {
          locationId: "lompoc",

          athleteName: "Assigned Athlete",

          appointmentStatus: "scheduled",

          appointmentCoach: "Coach A",
          appointmentCoachUid: "coach-a",

          claimedPriorExperience: "yes",
          claimedExperienceRange: "1-2",
          claimedExperienceNotes:
            "Family reports previous wrestling experience.",

          enrollmentDecision: "pending",
        }
      );

      await setDoc(
        doc(
          db,
          "admissions_appointments",
          "assigned-b"
        ),
        {
          locationId: "lompoc",

          athleteName: "Other Athlete",

          appointmentStatus: "scheduled",

          appointmentCoach: "Coach B",
          appointmentCoachUid: "coach-b",

          claimedPriorExperience: "no",

          enrollmentDecision: "pending",
        }
      );

      await setDoc(
        doc(
          db,
          "admissions_appointments",
          "inactive-assignment"
        ),
        {
          locationId: "lompoc",

          athleteName: "Inactive Assignment",

          appointmentStatus: "scheduled",

          appointmentCoach:
            "Inactive Coach",

          appointmentCoachUid:
            "coach-inactive",

          enrollmentDecision: "pending",
        }
      );

      /*
       * Legacy appointment deliberately has only
       * the historical display-name assignment.
       */
      await setDoc(
        doc(
          db,
          "admissions_appointments",
          "legacy-no-uid"
        ),
        {
          locationId: "lompoc",

          athleteName: "Legacy Athlete",

          appointmentStatus: "scheduled",

          appointmentCoach:
            "Coach A",

          enrollmentDecision: "pending",
        }
      );
    }
  );
});

after(async () => {
  await env?.cleanup();
});

function assessmentPayload() {
  return {
    assessmentStatus: "completed",

    assessedByCoachUid: "coach-a",
    assessedByCoachName: "Coach A",

    assessedAt: serverTimestamp(),

    verifiedExperienceYears: 2,

    coachAssessment:
      "Observed prior experience consistent with the verified category.",

    coachRecommendation: {
      journey: "path2legend",
      discipline: "wrestling",
    },
  };
}

test(
  "Admin can read assigned appointment",
  async () => {
    const db =
      env
        .authenticatedContext("admin-1")
        .firestore();

    await assertSucceeds(
      getDoc(
        doc(
          db,
          "admissions_appointments",
          "assigned-a"
        )
      )
    );
  }
);

test(
  "Authorized Management can read Lompoc appointment",
  async () => {
    const db =
      env
        .authenticatedContext(
          "manager-lompoc"
        )
        .firestore();

    await assertSucceeds(
      getDoc(
        doc(
          db,
          "admissions_appointments",
          "assigned-a"
        )
      )
    );
  }
);

test(
  "Assigned active Coach can read assigned appointment",
  async () => {
    const db =
      env
        .authenticatedContext("coach-a")
        .firestore();

    await assertSucceeds(
      getDoc(
        doc(
          db,
          "admissions_appointments",
          "assigned-a"
        )
      )
    );
  }
);

test(
  "Different Coach cannot read another Coach appointment",
  async () => {
    const db =
      env
        .authenticatedContext("coach-b")
        .firestore();

    await assertFails(
      getDoc(
        doc(
          db,
          "admissions_appointments",
          "assigned-a"
        )
      )
    );
  }
);

test(
  "Inactive assigned Coach cannot read appointment",
  async () => {
    const db =
      env
        .authenticatedContext(
          "coach-inactive"
        )
        .firestore();

    await assertFails(
      getDoc(
        doc(
          db,
          "admissions_appointments",
          "inactive-assignment"
        )
      )
    );
  }
);

test(
  "Legacy appointment without Coach UID is not Coach-readable",
  async () => {
    const db =
      env
        .authenticatedContext("coach-a")
        .firestore();

    await assertFails(
      getDoc(
        doc(
          db,
          "admissions_appointments",
          "legacy-no-uid"
        )
      )
    );
  }
);

test(
  "Assigned Coach scoped appointment query succeeds",
  async () => {
    const db =
      env
        .authenticatedContext("coach-a")
        .firestore();

    const snapshot =
      await assertSucceeds(
        getDocs(
          query(
            collection(
              db,
              "admissions_appointments"
            ),
            where(
              "appointmentCoachUid",
              "==",
              "coach-a"
            )
          )
        )
      );

    if (snapshot.size !== 1) {
      throw new Error(
        `Expected 1 assigned appointment, found ${snapshot.size}`
      );
    }

    if (
      snapshot.docs[0].id !==
      "assigned-a"
    ) {
      throw new Error(
        "Coach query returned wrong appointment."
      );
    }
  }
);

test(
  "Coach unscoped appointment query is denied",
  async () => {
    const db =
      env
        .authenticatedContext("coach-a")
        .firestore();

    await assertFails(
      getDocs(
        collection(
          db,
          "admissions_appointments"
        )
      )
    );
  }
);

test(
  "Assigned active Coach can submit authenticated assessment",
  async () => {
    const db =
      env
        .authenticatedContext("coach-a")
        .firestore();

    await assertSucceeds(
      updateDoc(
        doc(
          db,
          "admissions_appointments",
          "assigned-a"
        ),
        assessmentPayload()
      )
    );
  }
);

test(
  "Different Coach cannot submit assessment",
  async () => {
    const db =
      env
        .authenticatedContext("coach-b")
        .firestore();

    await assertFails(
      updateDoc(
        doc(
          db,
          "admissions_appointments",
          "assigned-a"
        ),
        {
          ...assessmentPayload(),
          assessedByCoachUid: "coach-b",
          assessedByCoachName: "Coach B",
        }
      )
    );
  }
);

test(
  "Inactive assigned Coach cannot submit assessment",
  async () => {
    const db =
      env
        .authenticatedContext(
          "coach-inactive"
        )
        .firestore();

    await assertFails(
      updateDoc(
        doc(
          db,
          "admissions_appointments",
          "inactive-assignment"
        ),
        {
          assessmentStatus: "completed",

          assessedByCoachUid:
            "coach-inactive",

          assessedByCoachName:
            "Inactive Coach",

          assessedAt:
            serverTimestamp(),

          verifiedExperienceYears: 1,

          coachAssessment:
            "Should not be accepted.",

          coachRecommendation: {
            journey: "path2legend",
            discipline: "wrestling",
          },
        }
      )
    );
  }
);

test(
  "Coach cannot impersonate assessment signer",
  async () => {
    const db =
      env
        .authenticatedContext("coach-a")
        .firestore();

    await assertFails(
      updateDoc(
        doc(
          db,
          "admissions_appointments",
          "assigned-a"
        ),
        {
          ...assessmentPayload(),
          assessedByCoachUid: "coach-b",
        }
      )
    );
  }
);

test(
  "Coach cannot change appointment assignment",
  async () => {
    const db =
      env
        .authenticatedContext("coach-a")
        .firestore();

    await assertFails(
      updateDoc(
        doc(
          db,
          "admissions_appointments",
          "assigned-a"
        ),
        {
          ...assessmentPayload(),
          appointmentCoachUid: "coach-b",
        }
      )
    );
  }
);

test(
  "Coach cannot change appointment status while assessing",
  async () => {
    const db =
      env
        .authenticatedContext("coach-a")
        .firestore();

    await assertFails(
      updateDoc(
        doc(
          db,
          "admissions_appointments",
          "assigned-a"
        ),
        {
          ...assessmentPayload(),
          appointmentStatus: "completed",
        }
      )
    );
  }
);

test(
  "Coach cannot change enrollment decision while assessing",
  async () => {
    const db =
      env
        .authenticatedContext("coach-a")
        .firestore();

    await assertFails(
      updateDoc(
        doc(
          db,
          "admissions_appointments",
          "assigned-a"
        ),
        {
          ...assessmentPayload(),
          enrollmentDecision: "enroll",
        }
      )
    );
  }
);

test(
  "Coach cannot change location while assessing",
  async () => {
    const db =
      env
        .authenticatedContext("coach-a")
        .firestore();

    await assertFails(
      updateDoc(
        doc(
          db,
          "admissions_appointments",
          "assigned-a"
        ),
        {
          ...assessmentPayload(),
          locationId:
            "santa-ynez-valley",
        }
      )
    );
  }
);

test(
  "Coach cannot submit unsupported verified experience years",
  async () => {
    const db =
      env
        .authenticatedContext("coach-a")
        .firestore();

    await assertFails(
      updateDoc(
        doc(
          db,
          "admissions_appointments",
          "assigned-a"
        ),
        {
          ...assessmentPayload(),
          verifiedExperienceYears: 10,
        }
      )
    );
  }
);

test(
  "Coach cannot create admissions appointment",
  async () => {
    const db =
      env
        .authenticatedContext("coach-a")
        .firestore();

    await assertFails(
      setDoc(
        doc(
          db,
          "admissions_appointments",
          "coach-created"
        ),
        {
          locationId: "lompoc",
          appointmentCoach:
            "Coach A",
          appointmentCoachUid:
            "coach-a",
          appointmentStatus:
            "scheduled",
        }
      )
    );
  }
);

test(
  "Coach cannot delete admissions appointment",
  async () => {
    const db =
      env
        .authenticatedContext("coach-a")
        .firestore();

    await assertFails(
      deleteDoc(
        doc(
          db,
          "admissions_appointments",
          "assigned-a"
        )
      )
    );
  }
);
