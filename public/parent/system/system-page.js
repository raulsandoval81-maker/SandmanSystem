function getParentSystemContext(search = window.location.search) {
  const source = new URLSearchParams(search);
  const context = new URLSearchParams();
  const athlete = String(
    source.get("athlete") || source.get("athleteUid") || source.get("uid") || source.get("id") || ""
  ).trim().toUpperCase();
  const discipline = String(source.get("discipline") || "").trim().toLowerCase();

  if (athlete) context.set("athlete", athlete);
  if (discipline) context.set("discipline", discipline);
  return context;
}

function preserveParentSystemContext() {
  const context = getParentSystemContext();
  document.querySelectorAll("[data-parent-system-back]").forEach((link) => {
    const url = new URL(link.getAttribute("href") || "/parent/system/", window.location.origin);
    context.forEach((value, key) => url.searchParams.set(key, value));
    link.setAttribute("href", `${url.pathname}${url.search}${url.hash}`);
  });
}

if (typeof window !== "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", preserveParentSystemContext);
  } else {
    preserveParentSystemContext();
  }
}

export { getParentSystemContext };
