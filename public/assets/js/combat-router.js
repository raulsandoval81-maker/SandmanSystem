export function routeCombat() {
  const params = new URLSearchParams(window.location.search);
  const athleteId = params.get("id") || "";

  if (!athleteId) {
    return { error: "Missing athlete id" };
  }

  if (athleteId.startsWith("F4_")) {
    return {
      athleteId,
      path: `/athletes/arsenal/combat/p2l/wrestling/index.html?id=${encodeURIComponent(athleteId)}`
    };
  }

  if (athleteId.startsWith("F8_")) {
    return {
      athleteId,
      path: `/athletes/arsenal/combat/z2h/wrestling/index.html?id=${encodeURIComponent(athleteId)}`
    };
  }

  return { error: "Unknown athlete type" };
}