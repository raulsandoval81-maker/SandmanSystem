// toast.js — tiny, dependency-free toast utility

// Auto-mount a container if none exists
function ensureRoot() {
  let root = document.getElementById("toast-root");
  if (!root) {
    root = document.createElement("div");
    root.id = "toast-root";
    Object.assign(root.style, {
      position: "fixed",
      right: "16px",
      bottom: "16px",
      zIndex: 9999,
      display: "flex",
      flexDirection: "column",
      gap: "8px",
      pointerEvents: "none",
    });
    document.body.appendChild(root);
  }
  return root;
}

function styleFor(kind) {
  // Dark card with subtle border; brand accent on left bar by kind
  const base = {
    background: "#121821",
    color: "#eaf2ff",
    border: "1px solid #2c3a4e",
    borderLeft: "4px solid #ffd633",
  };
  if (kind === "ok")    base.borderLeft = "4px solid #22c55e";
  if (kind === "warn")  base.borderLeft = "4px solid #f59e0b";
  if (kind === "error") base.borderLeft = "4px solid #ef4444";
  return base;
}

/**
 * toast(message: string, opts?: { kind?: 'ok'|'warn'|'error', ms?: number })
 */
export function toast(message, opts = {}) {
  const { kind = "ok", ms = 2200 } = opts;
  const root = ensureRoot();

  const card = document.createElement("div");
  Object.assign(card.style, {
    padding: "10px 12px",
    borderRadius: "10px",
    fontWeight: 800,
    fontSize: "14px",
    boxShadow: "0 8px 24px rgba(0,0,0,.35)",
    pointerEvents: "auto",
    ...styleFor(kind),
  });
  card.textContent = message;

  root.appendChild(card);

  // Animate in/out
  card.animate([{ opacity: 0, transform: "translateY(8px)" }, { opacity: 1, transform: "translateY(0)" }], { duration: 150, fill: "forwards" });

  setTimeout(() => {
    const anim = card.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 180, fill: "forwards" });
    anim.onfinish = () => card.remove();
  }, ms);
}
