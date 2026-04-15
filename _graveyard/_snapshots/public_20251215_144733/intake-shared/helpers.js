export const $ = (id) => document.getElementById(id);

export function setText(id, text) {
  const el = $(id);
  if (el) el.textContent = text ?? "";
}

export function setDisabled(id, disabled) {
  const el = $(id);
  if (el) el.disabled = !!disabled;
}

export function clean(s) {
  return String(s ?? "").trim();
}

export function splitFullName(full) {
  const parts = clean(full).split(/\s+/).filter(Boolean);
  const first = parts.shift() || "";
  const last = parts.join(" ");
  return { first, last };
}
