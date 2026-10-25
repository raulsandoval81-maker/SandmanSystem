// public/coaches/execution/engine/clipboard/clipboard-storage.js

export function getBlockCards(blockEl) {
  if (!blockEl) return [];

  return [...blockEl.querySelectorAll(".clip-title, .clip-title-link")]
    .map(el => {
      const cardEl = el.closest(".clip-card");

      return {
        id: cardEl?.dataset.cardId || el.getAttribute("href") || el.textContent.trim(),
        cardId: cardEl?.dataset.cardId || "",
        title: el.textContent.trim(),
        href: el.tagName === "A" ? el.getAttribute("href") : "",

        skill: cardEl?.dataset.skill || "",
        tier: cardEl?.dataset.tier || "",
        discipline: cardEl?.dataset.discipline || "",
        journey: cardEl?.dataset.journey || "",
        family: cardEl?.dataset.family || "",
        category: cardEl?.dataset.category || "",
        lane: cardEl?.dataset.lane || "",
        provenance: cardEl?.dataset.provenance || "",
        groupIds: parseList(cardEl?.dataset.groupIds),
        athleteIds: parseList(cardEl?.dataset.athleteIds)
      };
    })
    .filter(card => card.title);
}

function parseList(value) {
  try {
    const result = JSON.parse(value || "[]");
    return Array.isArray(result) ? result.map(String) : [];
  } catch {
    return [];
  }
}

export function getStoredClipboardCards(storageKey) {
  try {
    const arr = JSON.parse(
      localStorage.getItem(storageKey) || "[]"
    );

    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

export function dedupeClipboardCards(cards) {
  const seen = new Set();

  return cards.filter(card => {
    const id = String(card.id || card.href || card.title || "")
      .trim()
      .toLowerCase();

    const lane = String(card.lane || "")
      .trim()
      .toLowerCase();

    const key = `${id}__${lane}`;

    if (seen.has(key)) return false;

    seen.add(key);
    return true;
  });
}
