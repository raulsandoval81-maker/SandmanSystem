(function () {
  const key = "sandman_clipboard_v1";

  const btn = document.getElementById("addGameBtn");
  const statusEl = document.getElementById("statusMessage");

  if (!btn) return;

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

  function showStatus(message) {
    if (!statusEl) return;

    statusEl.textContent = message;

    clearTimeout(showStatus._timer);

    showStatus._timer = setTimeout(() => {
      statusEl.textContent = "";
    }, 1800);
  }

  function buildCard() {
    return {
      id: document.body.dataset.cardId || window.location.pathname,
      title: document.body.dataset.title || document.title,
      category: document.body.dataset.category || "game",
      lane: document.body.dataset.assignTo || "games",
      assignTo: document.body.dataset.assignTo || "games",
      minutes: Number(document.body.dataset.minutes || 5),
      timer: document.body.dataset.timer || "game",
      timerMode: document.body.dataset.timerMode || "group",
      href: window.location.pathname,
      addedAt: Date.now()
    };
  }

  function exists(data, id) {
    return data.some(card =>
      String(card.id || "") === String(id || "")
    );
  }

  function setAddedState() {
    btn.textContent = "Added";
    btn.classList.remove("primary");
    btn.classList.add("added");
    btn.dataset.added = "true";
  }

  function countGames(data) {
    return data.filter(card =>
      String(card.category || "").toLowerCase() === "game" ||
      String(card.lane || "").toLowerCase() === "games"
    ).length;
  }

  function updateInitialState() {
    const data = getClipboard();
    const card = buildCard();

    if (exists(data, card.id)) {
      setAddedState();
    }
  }

  btn.addEventListener("click", () => {
    const data = getClipboard();
    const card = buildCard();

    if (exists(data, card.id)) {
      setAddedState();
      showStatus(`${card.title} is already in clipboard.`);
      return;
    }

    if (countGames(data) >= 3) {
      showStatus("Max 3 games per section.");
      return;
    }

    data.push(card);
    saveClipboard(data);

    setAddedState();
    showStatus(`${card.title} added to clipboard.`);
  });

  updateInitialState();
})();