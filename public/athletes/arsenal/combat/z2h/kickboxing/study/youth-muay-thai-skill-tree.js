import { startYouthSimplifiedSkillTree } from "/assets/js/youth-simplified-skill-tree.js";

startYouthSimplifiedSkillTree({
  label: "Youth Muay Thai",
  manifestUrl: "/assets/data/youth-muay-thai-placement-manifest.json",
  expectedVersion: "r2c-youth-muay-thai-placement-v1",
  evidenceDiscipline: "muay-thai",
  progressKeys: ["muay-thai", "muaythai", "kickboxing", "kickbox"],
  f4Redirect: "/athletes/arsenal/combat/p2l/kickboxing/index.html",
});
