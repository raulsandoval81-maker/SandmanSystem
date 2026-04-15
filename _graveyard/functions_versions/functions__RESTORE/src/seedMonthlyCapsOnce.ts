import * as admin from "firebase-admin";
import { runSeedMonthlyCapsOnce } from "./seedMonthlyCaps";

if (!admin.apps.length) admin.initializeApp();

(async () => {
  try {
    await runSeedMonthlyCapsOnce();
    console.log("Monthly caps seeded");
    process.exit(0);
  } catch (e) {
    console.error("Seeding failed:", e);
    process.exit(1);
  }
})();
