const container = document.querySelector("[data-legacy-base]");
if (container) {
  for (let tier = 0; tier <= 7; tier += 1) {
    const link = document.createElement("a");
    link.href = `${container.dataset.legacyBase}/t${tier}/index.html`;
    link.textContent = `T${tier}`;
    container.append(link);
  }
}
