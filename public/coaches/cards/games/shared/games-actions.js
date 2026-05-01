(function () {
  const key = "sandman_clipboard_v1";

  function getClipboard() {
    try {
      const parsed = JSON.parse(localStorage.getItem(key) || "[]");
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  function saveClipboard(data) {
    localStorage.setItem(key, JSON.stringify(data));
  }

  function getSlotLimit(card) {
    const category = (card.category || "").toLowerCase().trim();
    const lane = (card.lane || "").toLowerCase().trim();

    if (category === "mat-talk" || lane === "onmat" || lane === "offmat") {
      return 1;
    }

    return 3;
  }

  function countInLane(data, lane) {
    const cleanLane = String(lane || "").toLowerCase().trim();

    return data.filter(card =>
      String(card.lane || "").toLowerCase().trim() === cleanLane
    ).length;
  }

  function buildCard(btn) {
    return {
      id: btn.dataset.cardId,
      title: btn.dataset.title,
      category: btn.dataset.category || "game",
      lane: "games",
      assignTo: "games",
      minutes: 0,
      timer: null,
      timerMode: null,
      href: window.location.pathname
    };
  }

  function exists(data, id, lane) {
    const cleanLane = String(lane || "").toLowerCase().trim();

    return data.some(card =>
      String(card.id || "") === String(id || "") &&
      String(card.lane || "").toLowerCase().trim() === cleanLane
    );
  }

  function setAddedState(btn, message = "Added") {
    btn.textContent = message;
    btn.disabled = true;
    btn.dataset.added = "true";
  }

  function setDefaultState(btn) {
    btn.textContent = btn.dataset.originalText || "Add to Games";
    btn.disabled = false;
    btn.dataset.added = "false";
  }

  document.querySelectorAll("[data-card-id]").forEach(btn => {
    btn.dataset.originalText = btn.dataset.originalText || btn.textContent;

    const current = getClipboard();
    const id = btn.dataset.cardId;

    if (exists(current, id, "games")) {
      setAddedState(btn, "Already Added");
      return;
    }

    setDefaultState(btn);

    btn.addEventListener("click", () => {
      const data = getClipboard();
      const card = buildCard(btn);

      if (exists(data, card.id, card.lane)) {
        setAddedState(btn, "Already Added");
        return;
      }

      const limit = getSlotLimit(card);
      const currentCount = countInLane(data, card.lane);

      if (currentCount >= limit) {
        alert("Max 3 games per section");
        return;
      }

      data.push(card);
      saveClipboard(data);
      setAddedState(btn, "Added");
    });
  });
})();