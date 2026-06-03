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

  function exists(data, id, lane) {
    return data.some(item => item.id === id && item.lane === lane);
  }

function laneHasAny(data, lane) {
  return data.some(item => item.lane === lane);
}

  function buildCard(btn, lane) {
    return {
      id: btn.dataset.cardId,
      title: btn.dataset.title,
      category: btn.dataset.category || "mat-talk",
      lane,
      assignTo: lane,
      minutes: 0,
      timer: null,
      timerMode: null,
      href: window.location.pathname
    };
  }

  function getLanes(btn) {
    const lane = (btn.dataset.lane || "").trim().toLowerCase();

    if (lane === "both") return ["onmat", "offmat"];
    if (lane === "onmat") return ["onmat"];
    if (lane === "offmat") return ["offmat"];

    return [];
  }

  function getStatusEl(btn) {
    return btn.closest(".card-actions")?.querySelector("#addStatus, .card-status") || null;
  }

  function setStatus(btn, message) {
    const status = getStatusEl(btn);
    if (status) status.textContent = message;
  }

  function markAdded(btn, message) {
    btn.textContent = "Added";
    btn.disabled = true;
    setStatus(btn, message);
  }

  function addMatTalkToClipboard(btn) {
    const data = getClipboard();
    const lanes = getLanes(btn);

    if (!lanes.length) return;

    let added = 0;

    lanes.forEach((lane) => {
      const id = btn.dataset.cardId;
if (exists(data, id, lane)) return;

if (laneHasAny(data, lane)) return;

data.push(buildCard(btn, lane));
added++;

    });

    saveClipboard(data);

    if (added === 0) {
      markAdded(btn, "Already added to On-Mat and Off-Mat.");
      return;
    }

    if (lanes.length === 2) {
      markAdded(btn, "Added to On-Mat and Off-Mat.");
    } else if (lanes[0] === "onmat") {
      markAdded(btn, "Added to On-Mat.");
    } else if (lanes[0] === "offmat") {
      markAdded(btn, "Added to Off-Mat.");
    }
  }

  function syncButtons() {
    const data = getClipboard();

    document.querySelectorAll("[data-card-id]").forEach((btn) => {
      const id = btn.dataset.cardId;
      const lanes = getLanes(btn);

      if (!lanes.length) return;

      const allPresent = lanes.every((lane) => exists(data, id, lane));
      if (!allPresent) return;

      if (lanes.length === 2) {
        markAdded(btn, "Already added to On-Mat and Off-Mat.");
      } else if (lanes[0] === "onmat") {
        markAdded(btn, "Already added to On-Mat.");
      } else if (lanes[0] === "offmat") {
        markAdded(btn, "Already added to Off-Mat.");
      }
    });
  }

  window.addMatTalkToClipboard = addMatTalkToClipboard;

  document.querySelectorAll("[data-card-id]").forEach((btn) => {
    btn.addEventListener("click", () => addMatTalkToClipboard(btn));
  });

  syncButtons();
})();