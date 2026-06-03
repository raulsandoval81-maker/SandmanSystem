(function () {
  const key = "sandman_clipboard_v1";
  const MAX_COND = 4;

  function getClipboard() {
    try {
      return JSON.parse(localStorage.getItem(key)) || [];
    } catch {
      return [];
    }
  }

  function saveClipboard(data) {
    localStorage.setItem(key, JSON.stringify(data));
  }

  function slugify(value) {
    return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  }

  function countInLane(data, lane) {
    return data.filter(item =>
      String(item.lane || "").toLowerCase().trim() === lane
    ).length;
  }

  function showStatus(message) {
    let el = document.getElementById("statusMessage");

    if (!el) {
      el = document.createElement("div");
      el.id = "statusMessage";
      el.style.position = "fixed";
      el.style.bottom = "20px";
      el.style.left = "50%";
      el.style.transform = "translateX(-50%)";
      el.style.background = "#121a2b";
      el.style.border = "1px solid #27304a";
      el.style.color = "#fff";
      el.style.padding = "10px 16px";
      el.style.borderRadius = "10px";
      el.style.fontWeight = "800";
      el.style.zIndex = "9999";
      document.body.appendChild(el);
    }

    el.textContent = message;
    el.style.opacity = "1";

    clearTimeout(el._timer);
    el._timer = setTimeout(() => {
      el.style.opacity = "0";
    }, 1500);
  }

  function markExistingItems() {
    const data = getClipboard();

    document.querySelectorAll("[data-cond]").forEach(el => {
      const title = el.dataset.cond;
      const prefix = el.dataset.prefix || "cond";
      const id = prefix + "-" + slugify(title);

      const exists = data.some(item =>
        item.id === id &&
        String(item.lane || "").toLowerCase().trim() === "cond"
      );

      if (exists) el.classList.add("added");
    });
  }

  document.querySelectorAll("[data-cond]").forEach(el => {
    el.addEventListener("click", () => {
      const title = el.dataset.cond;
      const prefix = el.dataset.prefix || "cond";
      const id = prefix + "-" + slugify(title);
      const lane = "cond";
      const data = getClipboard();

      const exists = data.some(item =>
        item.id === id &&
        String(item.lane || "").toLowerCase().trim() === lane
      );

      if (exists) {
        el.classList.add("added");
        showStatus(title + " already added.");
        return;
      }

      if (countInLane(data, lane) >= MAX_COND) {
        showStatus("Max 4 items in Conditioning.");
        return;
      }

      data.push({
        id,
        title,
        category: "conditioning",
        lane,
        assignTo: lane,
        minutes: 0,
        href: window.location.pathname
      });

      saveClipboard(data);
      el.classList.add("added");
      showStatus(title + " added.");
    });
  });

  markExistingItems();
})();