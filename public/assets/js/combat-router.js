function normalizeDiscipline(value = "") {
  const raw = String(value || "")
    .trim()
    .toLowerCase();

  if (
    raw === "kickbox" ||
    raw === "kickboxing" ||
    raw === "muay thai" ||
    raw === "muay-thai" ||
    raw === "muaythai"
  ) {
    return "kickboxing";
  }

  return raw;
}

export function routeCombat() {
  const params = new URLSearchParams(window.location.search);

  const athleteId = params.get("id") || "";

  const discipline = normalizeDiscipline(
    params.get("discipline") ||
    localStorage.getItem(
      `sandman_active_discipline_${athleteId}`
    ) ||
    ""
  );

  if (!athleteId) {
    return {
      error: "Missing athlete id"
    };
  }

  if (athleteId.startsWith("F4_")) {
    if (discipline === "boxing") {
      return {
        athleteId,
        discipline,
        path:
          `/athletes/arsenal/combat/p2l/boxing/index.html` +
          `?id=${encodeURIComponent(athleteId)}` +
          `&discipline=boxing`
      };
    }

    if (discipline === "kickboxing") {
      return {
        athleteId,
        discipline,
        path:
          `/athletes/arsenal/combat/p2l/kickboxing/index.html` +
          `?id=${encodeURIComponent(athleteId)}` +
          `&discipline=kickboxing`
      };
    }

    return {
      athleteId,
      discipline: "wrestling",
      path:
        `/athletes/arsenal/combat/p2l/wrestling/index.html` +
        `?id=${encodeURIComponent(athleteId)}` +
        `&discipline=wrestling`
    };
  }

  if (athleteId.startsWith("F8_")) {
    if (discipline === "kickboxing") {
      return {
        athleteId,
        discipline,
        path:
          `/athletes/arsenal/combat/z2h/kickboxing/index.html` +
          `?id=${encodeURIComponent(athleteId)}` +
          `&discipline=kickboxing`
      };
    }

    if (discipline === "boxing") {
      return {
        athleteId,
        discipline,
        path:
          `/athletes/arsenal/combat/z2h/boxing/index.html` +
          `?id=${encodeURIComponent(athleteId)}` +
          `&discipline=boxing`
      };
    }

    return {
      athleteId,
      discipline: "wrestling",
      path:
        `/athletes/arsenal/combat/z2h/wrestling/index.html` +
        `?id=${encodeURIComponent(athleteId)}` +
        `&discipline=wrestling`
    };
  }

  return {
    error: "Unknown athlete type"
  };
}
