import { requireAdmin } from "/assets/js/admin-guard.js";

function setStatus(message, isError = false) {
  const el = document.getElementById("hubStatus");
  if (!el) return;
  el.textContent = message;
  el.style.color = isError ? "#ff8a8a" : "#94a3b8";
}

async function initHub() {
  try {
    const user = await requireAdmin();
    const label = user?.email
      ? `Admin verified · ${user.email}`
      : "Admin verified";

    setStatus(label, false);
  } catch (err) {
    console.error("[hub.service] admin guard failed:", err);
    setStatus(`Admin access failed: ${err.message}`, true);

    // TEMP OFF:
    // window.location.href = "/";
  }
}

document.addEventListener("DOMContentLoaded", initHub);