export function routeCombat() {
  const params = new URLSearchParams(window.location.search);
  const athleteId = params.get("id") || "";

  if (!athleteId) {
    return { error: "Missing athlete id" };
  }

  if (athleteId.startsWith("F4_")) {
    return {
      athleteId,
      path: `/athletes/arsenal/combat/teen/index.html?id=${encodeURIComponent(athleteId)}`
    };
  }

  if (athleteId.startsWith("F8_")) {
    return {
      athleteId,
      path: `/athletes/arsenal/combat/youth/index.html?id=${encodeURIComponent(athleteId)}`
    };
  }

  return { error: "Unknown athlete type" };
}