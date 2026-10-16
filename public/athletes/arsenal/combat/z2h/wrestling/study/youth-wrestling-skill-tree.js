import { startYouthSimplifiedSkillTree } from "/assets/js/youth-simplified-skill-tree.js";

startYouthSimplifiedSkillTree({
  label: "Youth Wrestling",
  manifestUrl: "/assets/data/youth-wrestling-placement-manifest.json",
  expectedVersion: "r2c-youth-wrestling-placement-v1",
  evidenceDiscipline: "wrestling",
  progressKeys: ["wrestling", "wrestle"],
  allowLegacyRootFallback: true,
  f4Redirect: "/athletes/arsenal/combat/p2l/wrestling/index.html",
  treeElementId: "youthWrestlingSkillTree",
});
