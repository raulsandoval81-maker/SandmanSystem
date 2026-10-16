import { startYouthSimplifiedSkillTree } from "/assets/js/youth-simplified-skill-tree.js";

startYouthSimplifiedSkillTree({
  label: "Youth Boxing",
  manifestUrl: "/assets/data/youth-boxing-placement-manifest.json",
  expectedVersion: "r2c-youth-boxing-placement-v1",
  evidenceDiscipline: "boxing",
  progressKeys: ["boxing", "box"],
  f4Redirect: "/athletes/arsenal/combat/p2l/boxing/index.html",
});
