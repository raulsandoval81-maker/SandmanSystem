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
  doc,
  getDoc,
  getDocs,
  setDoc,
} from "firebase/firestore";

const PROJECT_ID = "sandmandashboard";

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

      const future =
        Date.now() + 60 * 60 * 1000;

      const past =
        Date.now() - 60 * 60 * 1000;

      await setDoc(
        doc(db, "intakeTokens", "tokenaaaa"),
        {
          exp: future,
          used: false,
          intakeAudience:
            "parent_guardian",
          proposalId: "proposal-syv-1",
          locationId: "santa-ynez-valley",
        }
      );

      await setDoc(
        doc(db, "intakeTokens", "tokenbbbb"),
        {
          exp: future,
          used: false,
          intakeAudience:
            "adult_athlete",
          proposalId: "proposal-syv-2",
          locationId: "santa-ynez-valley",
        }
      );

      await setDoc(
        doc(db, "intakeTokens", "expired1"),
        {
          exp: past,
          used: false,
          intakeAudience:
            "parent_guardian",
          proposalId: "proposal-syv-1",
          locationId: "santa-ynez-valley",
        }
      );

      await setDoc(
        doc(db, "intakeTokens", "usedtok1"),
        {
          exp: future,
          used: true,
          intakeAudience:
            "parent_guardian",
          proposalId: "proposal-syv-1",
          locationId: "santa-ynez-valley",
        }
      );

      await setDoc(
        doc(db, "staff", "manager1"),
        {
          role: "management",
          status: "active",
        }
      );
    }
  );
});

after(async () => {
  await env?.cleanup();
});

function parentPayload(
  ownerUid,
  tokenId = "tokenaaaa"
) {
  return {
    ownerUid,
    tokenId,
    proposalId:
      "proposal-syv-1",
    locationId:
      "santa-ynez-valley",
    intakeAudience:
      "parent_guardian",
    status: "submitted",
    approvedUid: null,

    athlete: {
      first: "Test",
      last: "Athlete",
      dob: "2012-01-01",
    },

    waiver: {
      viewed: true,
      agreed: true,
      signerType:
        "parent_guardian",
      signingAuthority:
        "guardian_for_athlete",
      signatureName:
        "Test Parent",
      signatureDate:
        "2026-08-26",
    },
  };
}

function adultPayload(
  ownerUid,
  tokenId = "tokenbbbb"
) {
  return {
    ownerUid,
    tokenId,
    proposalId:
      "proposal-syv-2",
    locationId:
      "santa-ynez-valley",
    intakeAudience:
      "adult_athlete",
    status: "submitted",
    approvedUid: null,

    athlete: {
      first: "Adult",
      last: "Athlete",
      dob: "2000-01-01",
    },

    waiver: {
      viewed: true,
      agreed: true,
      signerType:
        "adult_athlete",
      signingAuthority:
        "self",
      signatureName:
        "Adult Athlete",
      signatureDate:
        "2026-08-26",
    },
  };
}

test(
  "Family A can create its valid token-backed intake",
  async () => {
    const familyA =
      env.authenticatedContext(
        "familyA"
      ).firestore();

    await assertSucceeds(
      setDoc(
        doc(
          familyA,
          "intakes",
          "tokenaaaa"
        ),
        parentPayload("familyA")
      )
    );
  }
);

test(
  "Family A cannot read Family B intake",
  async () => {
    await env.withSecurityRulesDisabled(
      async (context) => {
        const db = context.firestore();

        await setDoc(
          doc(
            db,
            "intakes",
            "tokenbbbb"
          ),
          adultPayload("familyB")
        );
      }
    );

    const familyA =
      env.authenticatedContext(
        "familyA"
      ).firestore();

    await assertFails(
      getDoc(
        doc(
          familyA,
          "intakes",
          "tokenbbbb"
        )
      )
    );
  }
);

test(
  "Family B cannot overwrite Family A intake",
  async () => {
    await env.withSecurityRulesDisabled(
      async (context) => {
        const db = context.firestore();

        await setDoc(
          doc(
            db,
            "intakes",
            "tokenaaaa"
          ),
          parentPayload("familyA")
        );
      }
    );

    const familyB =
      env.authenticatedContext(
        "familyB"
      ).firestore();

    await assertFails(
      setDoc(
        doc(
          familyB,
          "intakes",
          "tokenaaaa"
        ),
        parentPayload("familyB"),
        { merge: true }
      )
    );
  }
);

test(
  "Management can read and list submitted intakes",
  async () => {
    await env.withSecurityRulesDisabled(
      async (context) => {
        const db = context.firestore();

        await setDoc(
          doc(
            db,
            "intakes",
            "tokenaaaa"
          ),
          parentPayload("familyA")
        );

        await setDoc(
          doc(
            db,
            "intakes",
            "tokenbbbb"
          ),
          adultPayload("familyB")
        );
      }
    );

    const management =
      env.authenticatedContext(
        "manager1"
      ).firestore();

    await assertSucceeds(
      getDoc(
        doc(
          management,
          "intakes",
          "tokenaaaa"
        )
      )
    );

    await assertSucceeds(
      getDocs(
        collection(
          management,
          "intakes"
        )
      )
    );
  }
);

test(
  "Expired token cannot create intake",
  async () => {
    const family =
      env.authenticatedContext(
        "familyExpired"
      ).firestore();

    await assertFails(
      setDoc(
        doc(
          family,
          "intakes",
          "expired1"
        ),
        parentPayload(
          "familyExpired",
          "expired1"
        )
      )
    );
  }
);

test(
  "Used token cannot create intake",
  async () => {
    const family =
      env.authenticatedContext(
        "familyUsed"
      ).firestore();

    await assertFails(
      setDoc(
        doc(
          family,
          "intakes",
          "usedtok1"
        ),
        parentPayload(
          "familyUsed",
          "usedtok1"
        )
      )
    );
  }
);

test(
  "Inactive management cannot read or list submitted intakes",
  async () => {
    await env.withSecurityRulesDisabled(
      async (context) => {
        const db = context.firestore();

        await setDoc(
          doc(
            db,
            "staff",
            "managerInactive"
          ),
          {
            role: "management",
            status: "inactive",
          }
        );

        await setDoc(
          doc(
            db,
            "intakes",
            "tokenaaaa"
          ),
          parentPayload("familyA")
        );
      }
    );

    const inactiveManager =
      env.authenticatedContext(
        "managerInactive"
      ).firestore();

    await assertFails(
      getDoc(
        doc(
          inactiveManager,
          "intakes",
          "tokenaaaa"
        )
      )
    );

    await assertFails(
      getDocs(
        collection(
          inactiveManager,
          "intakes"
        )
      )
    );
  }
);

test(
  "Family cannot change proposalId from its invite token",
  async () => {
    const familyA =
      env.authenticatedContext(
        "familyA"
      ).firestore();

    const payload =
      parentPayload("familyA");

    payload.proposalId =
      "proposal-tampered";

    await assertFails(
      setDoc(
        doc(
          familyA,
          "intakes",
          "tokenaaaa"
        ),
        payload
      )
    );
  }
);

test(
  "Family cannot change locationId from its invite token",
  async () => {
    const familyA =
      env.authenticatedContext(
        "familyA"
      ).firestore();

    const payload =
      parentPayload("familyA");

    payload.locationId =
      "lompoc";

    await assertFails(
      setDoc(
        doc(
          familyA,
          "intakes",
          "tokenaaaa"
        ),
        payload
      )
    );
  }
);
