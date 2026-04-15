(function () {
  const path = window.location.pathname;

  if (!path.includes("/cards/")) return;
  if (path.endsWith("index.html")) return;

  const container = document.createElement("div");
  container.className = "card-actions";

  container.innerHTML = `
    <a class="pill-btn" href="./index.html">← Back to Tier</a>
    <button class="pill-btn danger" id="addToMasterBtn">Add to Master</button>
    <a class="pill-btn" href="/cards/master/">Open Master</a>
  `;

  document.body.appendChild(container);

  const style = document.createElement("style");
  style.innerHTML = `
    .card-actions{
      position:fixed;
      bottom:20px;
      left:50%;
      transform:translateX(-50%);
      display:flex;
      gap:10px;
      flex-wrap:wrap;
      z-index:999;
    }
    .pill-btn{
      padding:.55rem 1rem;
      border-radius:999px;
      background:#0b1017;
      border:1px solid #1d2430;
      color:#f5f5f5;
      font-weight:800;
      font-size:.8rem;
      text-decoration:none;
      cursor:pointer;
    }
    .pill-btn:hover{
      border-color:#e63946;
      box-shadow:0 0 10px rgba(230,57,70,.25);
    }
    .pill-btn.danger{
      background:#e53935;
      color:#fff;
      border-color:#e53935;
    }
  `;
  document.head.appendChild(style);

  const btn = document.getElementById("addToMasterBtn");
  if (!btn) return;

  const key = "sandmanMasterQueue";

  const title =
    document.querySelector("h1, h2")?.textContent?.trim() ||
    document.title ||
    "Card";

  const href = window.location.pathname;

  btn.addEventListener("click", () => {
    const current = JSON.parse(localStorage.getItem(key) || "[]");
    const exists = current.some(item => item.href === href);

    if (!exists) {
      current.push({ title, href });
      localStorage.setItem(key, JSON.stringify(current));
    }

    btn.textContent = "Added";
    setTimeout(() => {
      btn.textContent = "Add to Master";
    }, 800);
  });
})();