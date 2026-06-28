// public/coaches/execution/engine/clipboard/slot-engine.js

import {
  makeClipCard
} from "./card-engine.js";

export function clearSlotCards(slotEl) {
  if (!slotEl) return;

  slotEl
    .querySelectorAll(".clip-card")
    .forEach(node => node.remove());
}

export function clearClipboardSlots() {
  const bank =
    document.getElementById("clipboard-list");

  if (bank) bank.innerHTML = "";

  [
    "cards-onmat",
    "cards-warmup-body",
    "cards-warmup-agility",
    "cards-drills",
    "cards-technique",
    "cards-water",
    "cards-live",
    "cards-cond",
    "cards-offmat"
  ].forEach(id => {
    const slot =
      document.getElementById(id);

    if (!slot) return;

    clearSlotCards(slot);
  });
}

export function getSlotLimit(card) {
  const category =
    (card.category || "").toLowerCase().trim();

  const lane =
    (card.lane || "").toLowerCase().trim();

  if (
    category === "mat-talk" ||
    lane === "onmat" ||
    lane === "offmat"
  ) {
    return 1;
  }

  return 3;
}

export function appendCardToSlot(slot, card) {
  if (!slot) return;

  const limit =
    getSlotLimit(card);

  const currentCards =
    slot.querySelectorAll(".clip-card");

  if (currentCards.length >= limit) {
    console.warn(`🚫 Slot limit reached (${limit}) for`, card);
    return;
  }

  slot.appendChild(
    makeClipCard(card)
  );
}