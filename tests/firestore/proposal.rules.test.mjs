import test from "node:test";
import assert from "node:assert/strict";

import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
} from "@firebase/rules-unit-testing";

import {
  doc,
  getDoc,
  collection,
  getDocs,
  query,
  where,
  setDoc,
} from "firebase/firestore";

import fs from "node:fs";

const PROJECT_ID = "sandman-proposal-rules-test";

const rules = fs.readFileSync(
  "firestore.rules",
  "utf8"
);

const testEnv =
  await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules,
      host: "127.0.0.1",
      port: 8081,
    },
  });

async function seed() {
  await testEnv.withSecurityRulesDisabled(
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
        doc(db, "staff", "manager-syv"),
        {
          role: "management",
          status: "active",
          locationIds: [
            "santa-ynez-valley",
          ],
        }
      );

      await setDoc(
        doc(db, "proposals", "P-SYV"),
        {
          proposalId: "P-SYV",
          status: "DRAFT",
          locationId: "santa-ynez-valley",
        }
      );

      await setDoc(
        doc(db, "proposals", "P-LOMPOC"),
        {
          proposalId: "P-LOMPOC",
          status: "DRAFT",
          locationId: "lompoc",
        }
      );
    }
  );
}

await seed();

test(
  "Admin can read any proposal",
  async () => {
    const db =
      testEnv
        .authenticatedContext("admin-1")
        .firestore();

    await assertSucceeds(
      getDoc(
        doc(
          db,
          "proposals",
          "P-LOMPOC"
        )
      )
    );
  }
);

test(
  "Santa Ynez Management can read Santa Ynez proposal",
  async () => {
    const db =
      testEnv
        .authenticatedContext("manager-syv")
        .firestore();

    await assertSucceeds(
      getDoc(
        doc(
          db,
          "proposals",
          "P-SYV"
        )
      )
    );
  }
);

test(
  "Santa Ynez Management cannot read Lompoc proposal",
  async () => {
    const db =
      testEnv
        .authenticatedContext("manager-syv")
        .firestore();

    await assertFails(
      getDoc(
        doc(
          db,
          "proposals",
          "P-LOMPOC"
        )
      )
    );
  }
);

test(
  "Santa Ynez Management scoped proposal query succeeds",
  async () => {
    const db =
      testEnv
        .authenticatedContext("manager-syv")
        .firestore();

    const snapshot =
      await assertSucceeds(
        getDocs(
          query(
            collection(
              db,
              "proposals"
            ),
            where(
              "locationId",
              "==",
              "santa-ynez-valley"
            )
          )
        )
      );

    assert.equal(
      snapshot.size,
      1
    );

    assert.equal(
      snapshot.docs[0].id,
      "P-SYV"
    );
  }
);

test(
  "Santa Ynez Management unscoped proposal query is denied",
  async () => {
    const db =
      testEnv
        .authenticatedContext("manager-syv")
        .firestore();

    await assertFails(
      getDocs(
        collection(
          db,
          "proposals"
        )
      )
    );
  }
);

test.after(
  async () => {
    await testEnv.cleanup();
  }
);

test(
  "Santa Ynez Management can create intake token from its paid proposal",
  async () => {
    await testEnv.withSecurityRulesDisabled(
      async (context) => {
        const db = context.firestore();

        await setDoc(
          doc(
            db,
            "proposals",
            "P-SYV-PAID"
          ),
          {
            proposalId:
              "P-SYV-PAID",
            status:
              "PAID",
            locationId:
              "santa-ynez-valley",
          }
        );
      }
    );

    const db =
      testEnv
        .authenticatedContext(
          "manager-syv"
        )
        .firestore();

    await assertSucceeds(
      setDoc(
        doc(
          db,
          "intakeTokens",
          "paidtoken1"
        ),
        {
          mode:
            "new_athlete",
          proposalId:
            "P-SYV-PAID",
          locationId:
            "santa-ynez-valley",
          intakeAudience:
            "parent_guardian",
          status:
            "invited",
          used:
            false,
          exp:
            Date.now() + 3600000,
        }
      )
    );
  }
);

test(
  "Management cannot create intake token from unpaid proposal",
  async () => {
    const db =
      testEnv
        .authenticatedContext(
          "manager-syv"
        )
        .firestore();

    await assertFails(
      setDoc(
        doc(
          db,
          "intakeTokens",
          "unpaidtoken1"
        ),
        {
          mode:
            "new_athlete",
          proposalId:
            "P-SYV",
          locationId:
            "santa-ynez-valley",
          intakeAudience:
            "parent_guardian",
          status:
            "invited",
          used:
            false,
          exp:
            Date.now() + 3600000,
        }
      )
    );
  }
);

test(
  "Management cannot change paid proposal location on intake token",
  async () => {
    await testEnv.withSecurityRulesDisabled(
      async (context) => {
        const db = context.firestore();

        await setDoc(
          doc(
            db,
            "proposals",
            "P-SYV-PAID"
          ),
          {
            proposalId:
              "P-SYV-PAID",
            status:
              "PAID",
            locationId:
              "santa-ynez-valley",
          }
        );
      }
    );

    const db =
      testEnv
        .authenticatedContext(
          "manager-syv"
        )
        .firestore();

    await assertFails(
      setDoc(
        doc(
          db,
          "intakeTokens",
          "tamperedloc1"
        ),
        {
          mode:
            "new_athlete",
          proposalId:
            "P-SYV-PAID",
          locationId:
            "lompoc",
          intakeAudience:
            "parent_guardian",
          status:
            "invited",
          used:
            false,
          exp:
            Date.now() + 3600000,
        }
      )
    );
  }
);

test(
  "Management cannot create intake token from another location paid proposal",
  async () => {
    await testEnv.withSecurityRulesDisabled(
      async (context) => {
        const db = context.firestore();

        await setDoc(
          doc(
            db,
            "proposals",
            "P-LOMPOC-PAID"
          ),
          {
            proposalId:
              "P-LOMPOC-PAID",
            status:
              "PAID",
            locationId:
              "lompoc",
          }
        );
      }
    );

    const db =
      testEnv
        .authenticatedContext(
          "manager-syv"
        )
        .firestore();

    await assertFails(
      setDoc(
        doc(
          db,
          "intakeTokens",
          "foreignloc1"
        ),
        {
          mode:
            "new_athlete",
          proposalId:
            "P-LOMPOC-PAID",
          locationId:
            "lompoc",
          intakeAudience:
            "adult_athlete",
          status:
            "invited",
          used:
            false,
          exp:
            Date.now() + 3600000,
        }
      )
    );
  }
);
